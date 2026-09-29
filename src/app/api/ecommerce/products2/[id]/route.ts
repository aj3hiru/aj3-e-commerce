import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { SaveError, updateProduct2 } from "@/lib/product2-save";
import { withApiErrors } from "@/lib/api-errors";
import { prisma } from "@/lib/db";

/** Update a product from /admin/ecommerce/products/add?edit=ID (multipart form). */
async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ success: false, message: "Invalid product id" }, { status: 400 });
  }
  try {
    const product = await updateProduct2(id, await req.formData());
    await logActivity(req, session.userId, "ecom_product_update", `Updated Product: ${product.name} (ID: ${product.id})`);
    return NextResponse.json({ success: true, id: product.id, name: product.name });
  } catch (e) {
    if (e instanceof SaveError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    if ((e as { code?: string })?.code || e instanceof TypeError) throw e; // missing product / unreadable form → clear 404 / 400
    console.error("add-product2 update failed", e);
    return NextResponse.json({ success: false, message: "Could not save the product. Please try again." }, { status: 500 });
  }
}

export const PUT = withApiErrors(handlePUT);

/** One product's details — Add Product copies them when a variant is picked ("Copy details"). */
async function handleGET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, message: "Invalid product id" }, { status: 400 });
  const p = await prisma.ecomProduct.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: "asc" }, select: { image: true } },
      specs: { orderBy: { sortOrder: "asc" }, select: { name: true, value: true } },
    },
  });
  if (!p) return NextResponse.json({ success: false, message: "This product no longer exists." }, { status: 404 });
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return NextResponse.json({
    success: true,
    product: {
      id: p.id, name: p.name, description: p.description, categoryId: p.categoryId, brandId: p.brandId, unit: p.unit, quantity: n(p.quantity),
      hsnCode: p.hsnCode, gstRate: Number(p.gstRate), price: Number(p.price), salePrice: n(p.salePrice), badgeTag: p.badgeTag, itemType: p.itemType,
      image: p.image, gallery: p.images.map((g: { image: string }) => g.image), specs: p.specs,
    },
  });
}

export const GET = withApiErrors(handleGET);
