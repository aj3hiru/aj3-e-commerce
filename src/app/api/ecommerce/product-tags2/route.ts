import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { parseTagInput } from "@/lib/tag2-save";
import { withApiErrors } from "@/lib/api-errors";

/** POST /api/ecommerce/product-tags2 — create a badge tag or item type. */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const parsed = parseTagInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ success: false, message: parsed.message, field: parsed.field }, { status: 400 });
  const t = parsed.value;

  try {
    const clash = await prisma.ecomProductTag.findFirst({ where: { slug: t.slug, tagGroup: t.tagGroup }, select: { id: true, label: true } });
    if (clash) return NextResponse.json({ success: false, message: `“${clash.label}” already uses that name.`, field: "label" }, { status: 409 });

    const created = await prisma.ecomProductTag.create({ data: t, select: { id: true } });
    await logActivity(req, session.userId, "ecom_tag_create", `Created ${t.tagGroup === "badge" ? "Badge Tag" : "Item Type"}: ${t.label} (ID: ${created.id})`);
    return NextResponse.json({ success: true, id: created.id });
  } catch {
    return NextResponse.json({ success: false, message: "Could not save the tag. Please try again." }, { status: 500 });
  }
}

export const POST = withApiErrors(handlePOST);
