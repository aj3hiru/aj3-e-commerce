import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { CouponSaveError, createCoupon2, parseCoupon2Input } from "@/lib/coupon2-save";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_coupons")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  try {
    const input = parseCoupon2Input(await req.json().catch(() => ({})));
    const c = await createCoupon2(input);
    await logActivity(req, session.userId, "ecom_coupon_create", `Created Coupon: ${c.title} (${c.code}) (ID: ${c.id})`);
    return NextResponse.json({ success: true, id: c.id, title: c.title });
  } catch (e) {
    if (e instanceof CouponSaveError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    console.error("coupons2 create failed", e);
    return NextResponse.json({ success: false, message: "Could not save the coupon. Please try again." }, { status: 500 });
  }
}
