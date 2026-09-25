import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { parseTagInput } from "@/lib/tag2-save";
import { withApiErrors } from "@/lib/api-errors";

type Ctx = { params: Promise<{ id: string }> };

async function guard(ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return { error: NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 }) } as const;
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return { error: NextResponse.json({ success: false, message: "Invalid tag." }, { status: 400 }) } as const;
  const tag = await prisma.ecomProductTag.findUnique({ where: { id } });
  if (!tag) return { error: NextResponse.json({ success: false, message: "This tag no longer exists." }, { status: 404 }) } as const;
  return { session, id, tag } as const;
}

/** How many products carry this tag right now. */
async function usageCount(tagGroup: string, slug: string) {
  return tagGroup === "item_type"
    ? prisma.ecomProduct.count({ where: { itemType: slug } })
    : prisma.ecomProduct.count({ where: { badgeTag: slug } });
}

async function handlePUT(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;

  const parsed = parseTagInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ success: false, message: parsed.message, field: parsed.field }, { status: 400 });
  const t = parsed.value;

  try {
    const clash = await prisma.ecomProductTag.findFirst({
      where: { slug: t.slug, tagGroup: t.tagGroup, NOT: { id: g.id } },
      select: { label: true },
    });
    if (clash) return NextResponse.json({ success: false, message: `“${clash.label}” already uses that name.`, field: "label" }, { status: 409 });

    // Products store the slug, so if the slug changes they must follow, or
    // they would silently lose their tag.
    const slugChanged = t.slug !== g.tag.slug || t.tagGroup !== g.tag.tagGroup;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.ecomProductTag.update({ where: { id: g.id }, data: t });
      if (slugChanged) {
        if (g.tag.tagGroup === "item_type") await tx.ecomProduct.updateMany({ where: { itemType: g.tag.slug }, data: { itemType: t.tagGroup === "item_type" ? t.slug : "normal" } });
        else await tx.ecomProduct.updateMany({ where: { badgeTag: g.tag.slug }, data: { badgeTag: t.tagGroup === "badge" ? t.slug : "none" } });
      }
    });

    await logActivity(req, g.session.userId, "ecom_tag_update", `Updated ${t.tagGroup === "badge" ? "Badge Tag" : "Item Type"}: ${t.label} (ID: ${g.id})`);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: "Could not save the tag. Please try again." }, { status: 500 });
  }
}

/** PATCH { status } — the quick Active / Inactive switch. */
async function handlePATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;

  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  if (body.status !== "active" && body.status !== "inactive") {
    return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
  }

  try {
    await prisma.ecomProductTag.update({ where: { id: g.id }, data: { status: body.status } });
    await logActivity(req, g.session.userId, "ecom_tag_update", `${body.status === "active" ? "Activated" : "Deactivated"} tag: ${g.tag.label} (ID: ${g.id})`);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: "Could not change the status. Please try again." }, { status: 500 });
  }
}

/**
 * DELETE — remove a tag. Products keep working: any product carrying it falls
 * back to "no tag", which is what the shop shows for an unknown value anyway.
 */
async function handleDELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;

  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const used = await usageCount(g.tag.tagGroup, g.tag.slug);
    if (used > 0 && !force) {
      return NextResponse.json({ success: false, needsConfirm: true, used, message: `${used} product${used === 1 ? "" : "s"} use this tag.` }, { status: 409 });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (used > 0) {
        if (g.tag.tagGroup === "item_type") await tx.ecomProduct.updateMany({ where: { itemType: g.tag.slug }, data: { itemType: "normal" } });
        else await tx.ecomProduct.updateMany({ where: { badgeTag: g.tag.slug }, data: { badgeTag: "none" } });
      }
      await tx.ecomProductTag.delete({ where: { id: g.id } });
    });

    await logActivity(req, g.session.userId, "ecom_tag_delete", `Deleted tag: ${g.tag.label} (ID: ${g.id}); ${used} product(s) reset`);
    return NextResponse.json({ success: true, used });
  } catch {
    return NextResponse.json({ success: false, message: "Could not delete the tag. Please try again." }, { status: 500 });
  }
}

export const PUT = withApiErrors(handlePUT);
export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
