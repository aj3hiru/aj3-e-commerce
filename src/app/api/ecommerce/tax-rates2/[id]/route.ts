import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { TaxRateSaveError, parseTaxRate2Input, updateTaxRate2 } from "@/lib/tax2-save";

type Ctx = { params: Promise<{ id: string }> };

async function guard(ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return { error: NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 }) };
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return { error: NextResponse.json({ success: false, message: "Invalid GST slab id" }, { status: 400 }) };
  return { session, id };
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  try {
    const input = parseTaxRate2Input(await req.json().catch(() => ({})));
    const r = await updateTaxRate2(g.id, input);
    await logActivity(req, g.session.userId, "ecom_gst_update", `Updated GST slab: ${r.label} (${Number(r.rate)}%) (ID: ${r.id})`);
    return NextResponse.json({ success: true, id: r.id, label: r.label });
  } catch (e) {
    if (e instanceof TaxRateSaveError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    console.error("tax-rates2 update failed", e);
    return NextResponse.json({ success: false, message: "Could not save this GST slab. Please try again." }, { status: 500 });
  }
}

/** Set this slab as the default (unsets every other row first, matching the v1 route). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const found = await prisma.ecomGstRate.findUnique({ where: { id: g.id }, select: { label: true } });
  if (!found) return NextResponse.json({ success: false, message: "This GST slab no longer exists." }, { status: 404 });
  await prisma.ecomGstRate.updateMany({ data: { isDefault: false }, where: {} });
  await prisma.ecomGstRate.update({ where: { id: g.id }, data: { isDefault: true } });
  await logActivity(req, g.session.userId, "ecom_gst_update", `Set default GST slab: ${found.label} (ID: ${g.id})`);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const rate = await prisma.ecomGstRate.findUnique({ where: { id: g.id } });
  if (!rate) return NextResponse.json({ success: false, message: "This GST slab no longer exists." }, { status: 404 });
  await prisma.ecomGstRate.delete({ where: { id: g.id } });
  // If the default slab was deleted, the store is left with no default — that
  // mirrors the v1 page's own behavior (it doesn't auto-promote another slab
  // either), rather than silently picking one for the admin.
  await logActivity(req, g.session.userId, "ecom_gst_delete", `Deleted GST slab: ${rate.label} (${Number(rate.rate)}%) (ID: ${g.id})`);
  return NextResponse.json({ success: true });
}
