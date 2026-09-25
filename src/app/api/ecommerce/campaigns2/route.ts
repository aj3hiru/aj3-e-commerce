import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { parseCampaignInput, checkCampaignRefs } from "@/lib/campaign-validate";
import { sanitizeCampaignHome } from "@/types/campaign-home";
import { lookupRefs } from "@/lib/campaign-refs";
import { clearCampaignCache } from "@/lib/campaign-pricing";

/** POST /api/ecommerce/campaigns2 — create a campaign (Campaign Offer 2). */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseCampaignInput(body, new Date(), true);
  const home = sanitizeCampaignHome(body?.home);
  if (!parsed.ok) return NextResponse.json({ success: false, message: parsed.message, field: parsed.field }, { status: 400 });
  const c = parsed.value;

  try {
    const refError = checkCampaignRefs(c, await lookupRefs(c));
    if (refError) return NextResponse.json({ success: false, message: refError, field: "targets" }, { status: 400 });

    const created = await prisma.ecomCampaign.create({
      data: {
        name: c.name, scope: c.scope, discountType: c.discountType, discountValue: c.discountValue,
        startsAt: c.startsAt, endsAt: c.endsAt, isPaused: c.isPaused, homeDisplay: home as unknown as object,
        targets: { create: c.targets.map((t) => ({ targetType: t.targetType, targetId: t.targetId, fixedPrice: t.fixedPrice })) },
      },
      select: { id: true },
    });
    clearCampaignCache();
    await logActivity(req, session.userId, "ecom_campaign_create", `Created Campaign: ${c.name} (ID: ${created.id})`);
    return NextResponse.json({ success: true, id: created.id });
  } catch (e) {
    console.error("campaign create failed", e);
    return NextResponse.json({ success: false, message: setupHint(e) }, { status: 500 });
  }
}

/** A missing table is the one likely setup problem — say so plainly. */
function setupHint(e: unknown): string {
  const text = e instanceof Error ? e.message : "";
  return /does not exist|doesn't exist|P2021|P2022/i.test(text)
    ? "The campaign tables are not in the database yet. Run the database update (npx prisma db push) on the server, then try again."
    : "Could not save the campaign. Please try again.";
}
