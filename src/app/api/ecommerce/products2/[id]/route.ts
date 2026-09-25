import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { SaveError, updateProduct2 } from "@/lib/product2-save";
import { withApiErrors } from "@/lib/api-errors";

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
    console.error("add-product2 update failed", e);
    return NextResponse.json({ success: false, message: "Could not save the product. Please try again." }, { status: 500 });
  }
}

export const PUT = withApiErrors(handlePUT);
