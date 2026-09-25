import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { deleteUploadedImage } from "@/lib/upload";
import { BrandSaveError, updateBrand2 } from "@/lib/brand2-save";
import { withApiErrors } from "@/lib/api-errors";

type Ctx = { params: Promise<{ id: string }> };

async function guard(ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return { error: NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 }) };
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return { error: NextResponse.json({ success: false, message: "Invalid brand id" }, { status: 400 }) };
  return { session, id };
}

/** Full edit (name, slug, logo, popular, status) — multipart form. */
async function handlePUT(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  try {
    const b = await updateBrand2(g.id, await req.formData());
    await logActivity(req, g.session.userId, "ecom_brand_update", `Updated Brand: ${b.name} (ID: ${b.id})`);
    return NextResponse.json({ success: true, id: b.id, name: b.name });
  } catch (e) {
    if (e instanceof BrandSaveError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    console.error("brands2 update failed", e);
    return NextResponse.json({ success: false, message: "Could not save the brand. Please try again." }, { status: 500 });
  }
}

/** Quick toggle from the list: { status: "active"|"inactive" } and/or { isPopular: boolean }. */
async function handlePATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const data: { status?: string; isPopular?: boolean } = {};
  if (body.status === "active" || body.status === "inactive") data.status = body.status;
  if (typeof body.isPopular === "boolean") data.isPopular = body.isPopular;
  if (!Object.keys(data).length) return NextResponse.json({ success: false, message: "Nothing to change." }, { status: 400 });
  const found = await prisma.ecomBrand.findUnique({ where: { id: g.id }, select: { id: true } });
  if (!found) return NextResponse.json({ success: false, message: "This brand no longer exists." }, { status: 404 });
  await prisma.ecomBrand.update({ where: { id: g.id }, data });
  return NextResponse.json({ success: true });
}

/**
 * Delete. A brand that products still use can only be deleted with
 * ?detach=1, which first clears the brand from those products (they keep
 * everything else) — instead of failing on the database's foreign key.
 */
async function handleDELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const brand = await prisma.ecomBrand.findUnique({ where: { id: g.id }, select: { name: true, logo: true } });
  if (!brand) return NextResponse.json({ success: false, message: "This brand no longer exists." }, { status: 404 });
  const used = await prisma.ecomProduct.count({ where: { brandId: g.id } });
  const detach = req.nextUrl.searchParams.get("detach") === "1";
  if (used > 0 && !detach) {
    return NextResponse.json({ success: false, message: `${used} product${used === 1 ? " uses" : "s use"} this brand.`, inUse: used }, { status: 409 });
  }
  try {
    if (used > 0) await prisma.ecomProduct.updateMany({ where: { brandId: g.id }, data: { brandId: null } });
    await prisma.ecomBrand.delete({ where: { id: g.id } });
  } catch (e) {
    console.error("brands2 delete failed", e);
    return NextResponse.json({ success: false, message: "Could not delete this brand. Please try again." }, { status: 500 });
  }
  await deleteUploadedImage(brand.logo);
  await logActivity(req, g.session.userId, "ecom_brand_delete", `Deleted Brand: ${brand.name} (ID: ${g.id})${used ? ` — removed from ${used} products` : ""}`);
  return NextResponse.json({ success: true, detached: used });
}

export const PUT = withApiErrors(handlePUT);
export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
