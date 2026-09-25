import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { createProduct2, SaveError } from "@/lib/product2-save";
import { withApiErrors } from "@/lib/api-errors";

/** Create a product from /admin/ecommerce/products/add (multipart form). */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  try {
    const product = await createProduct2(await req.formData());
    await logActivity(req, session.userId, "ecom_product_create", `Created Product: ${product.name} (ID: ${product.id})`);
    return NextResponse.json({ success: true, id: product.id, name: product.name });
  } catch (e) {
    if (e instanceof SaveError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    console.error("add-product2 create failed", e);
    return NextResponse.json({ success: false, message: "Could not save the product. Please try again." }, { status: 500 });
  }
}

export const POST = withApiErrors(handlePOST);
