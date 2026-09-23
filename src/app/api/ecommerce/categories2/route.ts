import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { CategorySaveError, createCategory2 } from "@/lib/category2-save";

/** Create a category from /admin/ecommerce/categories2 (multipart form). */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_categories")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  try {
    const c = await createCategory2(await req.formData());
    await logActivity(req, session.userId, "ecom_category_create", `Created Category: ${c.name} (ID: ${c.id})`);
    return NextResponse.json({ success: true, id: c.id, name: c.name });
  } catch (e) {
    if (e instanceof CategorySaveError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    console.error("categories2 create failed", e);
    return NextResponse.json({ success: false, message: "Could not save the category. Please try again." }, { status: 500 });
  }
}
