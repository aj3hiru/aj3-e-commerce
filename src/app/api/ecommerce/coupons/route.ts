import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { withApiErrors } from "@/lib/api-errors";

async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_coupons")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
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
  if (appliesTo === "product" && !productId) return NextResponse.json({ success: false, message: "Please select a product for this coupon." }, { status: 400 });
  if (appliesTo === "category" && !categoryId) return NextResponse.json({ success: false, message: "Please select a category for this coupon." }, { status: 400 });
  if (appliesTo === "subcategory" && !subcategoryId) return NextResponse.json({ success: false, message: "Please select a sub category for this coupon." }, { status: 400 });

  const dup = await prisma.ecomCoupon.findFirst({ where: { code } });
  if (dup) return NextResponse.json({ success: false, message: "This coupon code is already in use. Please choose another." }, { status: 409 });

  const created = await prisma.ecomCoupon.create({
    data: { title, code, numberOfTimes, discountType, discountValue, appliesTo, productId, categoryId, subcategoryId, status: "active" },
  });
  await logActivity(req, session.userId, "ecom_coupon_create", `Created Coupon: ${title} (${code}) (ID: ${created.id})`);

  return NextResponse.json({ success: true, redirect: "/admin/ecommerce/coupons?success=created" });
}

export const POST = withApiErrors(handlePOST);
