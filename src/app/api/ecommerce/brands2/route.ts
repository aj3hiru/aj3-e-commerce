import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { BrandSaveError, createBrand2 } from "@/lib/brand2-save";

/** Create a brand from /admin/ecommerce/brands2 (multipart form). */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  try {
    const b = await createBrand2(await req.formData());
    await logActivity(req, session.userId, "ecom_brand_create", `Created Brand: ${b.name} (ID: ${b.id})`);
    return NextResponse.json({ success: true, id: b.id, name: b.name });
  } catch (e) {
    if (e instanceof BrandSaveError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    console.error("brands2 create failed", e);
    return NextResponse.json({ success: false, message: "Could not save the brand. Please try again." }, { status: 500 });
  }
}
