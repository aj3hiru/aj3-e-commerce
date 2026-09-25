import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { CouponSaveError, parseCoupon2Input, updateCoupon2 } from "@/lib/coupon2-save";
import { withApiErrors } from "@/lib/api-errors";

type Ctx = { params: Promise<{ id: string }> };

async function guard(ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_coupons")) {
    return { error: NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 }) };
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return { error: NextResponse.json({ success: false, message: "Invalid coupon id" }, { status: 400 }) };
  return { session, id };
}

/** Full edit — JSON body, same shape parseCoupon2Input expects. */
async function handlePUT(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  try {
    const input = parseCoupon2Input(await req.json().catch(() => ({})));
    const c = await updateCoupon2(g.id, input);
    await logActivity(req, g.session.userId, "ecom_coupon_update", `Updated Coupon: ${c.title} (${c.code}) (ID: ${c.id})`);
    return NextResponse.json({ success: true, id: c.id, title: c.title });
  } catch (e) {
    if (e instanceof CouponSaveError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    console.error("coupons2 update failed", e);
    return NextResponse.json({ success: false, message: "Could not save the coupon. Please try again." }, { status: 500 });
  }
}

/** Quick toggle from the card grid: status and/or isPaused. */
async function handlePATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const data: { status?: string; isPaused?: boolean } = {};
  if (body.status === "active" || body.status === "inactive") data.status = body.status;
  if (typeof body.isPaused === "boolean") data.isPaused = body.isPaused;
  if (!Object.keys(data).length) return NextResponse.json({ success: false, message: "Nothing to change." }, { status: 400 });

  const found = await prisma.ecomCoupon.findUnique({ where: { id: g.id }, select: { id: true, title: true, code: true } });
  if (!found) return NextResponse.json({ success: false, message: "This coupon no longer exists." }, { status: 404 });
  await prisma.ecomCoupon.update({ where: { id: g.id }, data });

  if (typeof data.isPaused === "boolean") {
    await logActivity(req, g.session.userId, data.isPaused ? "ecom_coupon_pause" : "ecom_coupon_resume",
      `${data.isPaused ? "Paused" : "Resumed"} Coupon: ${found.title} (${found.code}) (ID: ${g.id})`);
  }
  return NextResponse.json({ success: true });
}

async function handleDELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const coupon = await prisma.ecomCoupon.findUnique({ where: { id: g.id }, select: { title: true, code: true } });
  if (!coupon) return NextResponse.json({ success: false, message: "This coupon no longer exists." }, { status: 404 });
  await prisma.ecomCoupon.delete({ where: { id: g.id } });
  await logActivity(req, g.session.userId, "ecom_coupon_delete", `Deleted Coupon: ${coupon.title} (${coupon.code}) (ID: ${g.id})`);
  return NextResponse.json({ success: true });
}

export const PUT = withApiErrors(handlePUT);
export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
