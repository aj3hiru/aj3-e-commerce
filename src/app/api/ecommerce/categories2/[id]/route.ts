import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { deleteUploadedImage } from "@/lib/upload";
import { CategorySaveError, updateCategory2 } from "@/lib/category2-save";
import { withApiErrors } from "@/lib/api-errors";

type Ctx = { params: Promise<{ id: string }> };

async function guard(ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_categories")) {
    return { error: NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 }) };
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return { error: NextResponse.json({ success: false, message: "Invalid category id" }, { status: 400 }) };
  return { session, id };
}

/** Full edit (name, slug, image, meta, serial, status) — multipart form. */
async function handlePUT(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  try {
    const c = await updateCategory2(g.id, await req.formData());
    await logActivity(req, g.session.userId, "ecom_category_update", `Updated Category: ${c.name} (ID: ${c.id})`);
    return NextResponse.json({ success: true, id: c.id, name: c.name });
  } catch (e) {
    if (e instanceof CategorySaveError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    console.error("categories2 update failed", e);
    return NextResponse.json({ success: false, message: "Could not save the category. Please try again." }, { status: 500 });
  }
}

/** Quick toggle from the list: { status: "active"|"inactive" } and/or { serial: number }. */
async function handlePATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const data: { status?: string; serial?: number } = {};
  if (body.status === "active" || body.status === "inactive") data.status = body.status;
  if (typeof body.serial === "number" && Number.isFinite(body.serial)) data.serial = Math.max(0, Math.trunc(body.serial));
  if (!Object.keys(data).length) return NextResponse.json({ success: false, message: "Nothing to change." }, { status: 400 });
  const found = await prisma.ecomCategory.findUnique({ where: { id: g.id }, select: { id: true } });
  if (!found) return NextResponse.json({ success: false, message: "This category no longer exists." }, { status: 404 });
  await prisma.ecomCategory.update({ where: { id: g.id }, data });
  return NextResponse.json({ success: true });
}

/**
 * Delete. A category that subcategories or products still reference can
 * only be deleted with ?detach=1, which first clears the link (subcategories
 * are deleted with it — they can't exist without a parent category; products
 * just lose their category) — instead of failing on the database's foreign key.
 */
async function handleDELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const category = await prisma.ecomCategory.findUnique({ where: { id: g.id }, select: { name: true, image: true } });
  if (!category) return NextResponse.json({ success: false, message: "This category no longer exists." }, { status: 404 });

  const [subcats, products] = await Promise.all([
    prisma.ecomSubcategory.count({ where: { categoryId: g.id } }),
    prisma.ecomProduct.count({ where: { categoryId: g.id } }),
  ]);
  const used = subcats + products;
  const detach = req.nextUrl.searchParams.get("detach") === "1";
  if (used > 0 && !detach) {
    return NextResponse.json(
      { success: false, message: `${subcats ? `${subcats} subcategor${subcats === 1 ? "y" : "ies"}` : ""}${subcats && products ? " and " : ""}${products ? `${products} product${products === 1 ? "" : "s"}` : ""} still reference this category.`, inUse: used },
      { status: 409 }
    );
  }

  try {
    if (products > 0) await prisma.ecomProduct.updateMany({ where: { categoryId: g.id }, data: { categoryId: null } });
    if (subcats > 0) await prisma.ecomSubcategory.deleteMany({ where: { categoryId: g.id } });
    await prisma.ecomCategory.delete({ where: { id: g.id } });
  } catch (e) {
    console.error("categories2 delete failed", e);
    return NextResponse.json({ success: false, message: "Could not delete this category. Please try again." }, { status: 500 });
  }
  await deleteUploadedImage(category.image);
  await logActivity(req, g.session.userId, "ecom_category_delete", `Deleted Category: ${category.name} (ID: ${g.id})${used ? ` — detached from ${used} linked record${used === 1 ? "" : "s"}` : ""}`);
  return NextResponse.json({ success: true, detached: used });
}

export const PUT = withApiErrors(handlePUT);
export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
