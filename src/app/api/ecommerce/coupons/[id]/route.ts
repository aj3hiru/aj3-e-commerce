import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_coupons")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const couponId = Number(id);
  const body = await req.json().catch(() => ({}));

  if (body.status && Object.keys(body).length === 1) {
    await prisma.ecomCoupon.update({ where: { id: couponId }, data: { status: body.status === "inactive" ? "inactive" : "active" } });
    return NextResponse.json({ success: true });
  }

  const title = (body.title ?? "").trim();
  const code = (body.code ?? "").trim().toUpperCase();
  const numberOfTimes = Math.max(1, Number(body.numberOfTimes ?? 1));
  const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
  const discountValue = Number(body.discountValue ?? 0);
  const appliesTo = ["all", "product", "category", "subcategory"].includes(body.appliesTo) ? body.appliesTo : "all";
  const productId = appliesTo === "product" ? Number(body.productId) || null : null;
  const categoryId = appliesTo === "category" ? Number(body.categoryId) || null : null;
  const subcategoryId = appliesTo === "subcategory" ? Number(body.subcategoryId) || null : null;

  if (!title || !code) return NextResponse.json({ success: false, message: "Title and Code are required." }, { status: 400 });
  if (discountValue <= 0) return NextResponse.json({ success: false, message: "Discount must be greater than 0." }, { status: 400 });

  const dup = await prisma.ecomCoupon.findFirst({ where: { code, id: { not: couponId } } });
  if (dup) return NextResponse.json({ success: false, message: "This coupon code is already in use. Please choose another." }, { status: 409 });

  await prisma.ecomCoupon.update({
    where: { id: couponId },
    data: { title, code, numberOfTimes, discountType, discountValue, appliesTo, productId, categoryId, subcategoryId },
  });
  await logActivity(req, session.userId, "ecom_coupon_update", `Updated Coupon: ${title} (${code}) (ID: ${couponId})`);

  return NextResponse.json({ success: true, redirect: "/admin/ecommerce/coupons?success=updated" });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_coupons")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const couponId = Number(id);

  const coupon = await prisma.ecomCoupon.findUnique({ where: { id: couponId }, select: { title: true } });
  await prisma.ecomCoupon.delete({ where: { id: couponId } });
  await logActivity(req, session.userId, "ecom_coupon_delete", `Deleted Coupon: ${coupon?.title ?? "Unknown"} (ID: ${couponId})`);

  return NextResponse.json({ success: true, redirect: "/admin/ecommerce/coupons?success=deleted" });
}
