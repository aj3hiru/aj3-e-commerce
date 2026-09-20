import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { campaignState } from "@/lib/campaign-core";
import { parseCampaignInput, checkCampaignRefs } from "@/lib/campaign-validate";
import { lookupRefs } from "@/lib/campaign-refs";
import { clearCampaignCache } from "@/lib/campaign-pricing";

type Ctx = { params: Promise<{ id: string }> };

async function guard(req: NextRequest, ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return { error: NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 }) } as const;
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: NextResponse.json({ success: false, message: "Invalid campaign." }, { status: 400 }) } as const;
  }
  const campaign = await prisma.ecomCampaign.findUnique({ where: { id }, select: { id: true, name: true, isPaused: true, startsAt: true, endsAt: true } });
  if (!campaign) {
    return { error: NextResponse.json({ success: false, message: "This campaign no longer exists." }, { status: 404 }) } as const;
  }
  return { session, id, campaign, req } as const;
}

/** PUT — save the edit form (everything about the campaign, including its products/groups). */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const g = await guard(req, ctx);
  if ("error" in g) return g.error;

  const parsed = parseCampaignInput(await req.json().catch(() => null), new Date(), false);
  if (!parsed.ok) return NextResponse.json({ success: false, message: parsed.message, field: parsed.field }, { status: 400 });
  const c = parsed.value;

  try {
    const refError = checkCampaignRefs(c, await lookupRefs(c));
    if (refError) return NextResponse.json({ success: false, message: refError, field: "targets" }, { status: 400 });

    await prisma.$transaction([
      prisma.ecomCampaign.update({
        where: { id: g.id },
        data: { name: c.name, scope: c.scope, discountType: c.discountType, discountValue: c.discountValue, startsAt: c.startsAt, endsAt: c.endsAt, isPaused: c.isPaused },
      }),
      prisma.ecomCampaignTarget.deleteMany({ where: { campaignId: g.id } }),
      prisma.ecomCampaignTarget.createMany({
        data: c.targets.map((t) => ({ campaignId: g.id, targetType: t.targetType, targetId: t.targetId, fixedPrice: t.fixedPrice })),
      }),
    ]);
    clearCampaignCache();
    await logActivity(req, g.session.userId, "ecom_campaign_update", `Updated Campaign: ${c.name} (ID: ${g.id})`);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("campaign update failed", e);
    return NextResponse.json({ success: false, message: "Could not save the campaign. Please try again." }, { status: 500 });
  }
}

/** PATCH { action: "pause" | "resume" | "end" } — the quick buttons in the table. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(req, ctx);
  if ("error" in g) return g.error;

  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  const now = new Date();
  const state = campaignState(g.campaign, now);
  const bad = (message: string) => NextResponse.json({ success: false, message }, { status: 400 });

  let data: { isPaused?: boolean; endsAt?: Date };
  let verb: string;
  if (body.action === "pause") {
    if (state === "ended") return bad("This campaign has already ended.");
    data = { isPaused: true };
    verb = "Paused";
  } else if (body.action === "resume") {
    if (state === "ended") return bad("This campaign has ended. Edit it and set a new end time to run it again.");
    data = { isPaused: false };
    verb = "Resumed";
  } else if (body.action === "end") {
    if (state === "ended") return bad("This campaign has already ended.");
    data = { endsAt: now };
    verb = "Ended";
  } else {
    return bad("Unknown action.");
  }

  try {
    await prisma.ecomCampaign.update({ where: { id: g.id }, data });
    clearCampaignCache();
    await logActivity(req, g.session.userId, "ecom_campaign_update", `${verb} Campaign: ${g.campaign.name} (ID: ${g.id})`);
    return NextResponse.json({ success: true, endsAt: data.endsAt ? data.endsAt.toISOString() : undefined });
  } catch (e) {
    console.error("campaign action failed", e);
    return NextResponse.json({ success: false, message: "Could not update the campaign. Please try again." }, { status: 500 });
  }
}

/** DELETE — only a campaign that made no sales; otherwise it stays as history. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(req, ctx);
  if ("error" in g) return g.error;

  try {
    const sold = await prisma.ecomCampaignSale.count({ where: { campaignId: g.id } });
    if (sold > 0) {
      return NextResponse.json({ success: false, message: "This campaign has sales, so it is kept in the history. End it instead." }, { status: 409 });
    }
    await prisma.ecomCampaign.delete({ where: { id: g.id } });
    clearCampaignCache();
    await logActivity(req, g.session.userId, "ecom_campaign_delete", `Deleted Campaign: ${g.campaign.name} (ID: ${g.id})`);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("campaign delete failed", e);
    return NextResponse.json({ success: false, message: "Could not delete the campaign. Please try again." }, { status: 500 });
  }
}
