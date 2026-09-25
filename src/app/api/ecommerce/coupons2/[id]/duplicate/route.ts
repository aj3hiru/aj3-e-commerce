import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { withApiErrors } from "@/lib/api-errors";

type Ctx = { params: Promise<{ id: string }> };

/** Duplicate: same terms, a fresh "-COPY" (then "-COPY-2", ...) code, usage
 *  reset to 0, and paused by default so a copy never silently starts live. */
async function handlePOST(req: NextRequest, ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_coupons")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, message: "Invalid coupon id" }, { status: 400 });

  const src = await prisma.ecomCoupon.findUnique({ where: { id } });
  if (!src) return NextResponse.json({ success: false, message: "This coupon no longer exists." }, { status: 404 });

  let code = `${src.code}-COPY`;
  let n = 2;
  while (await prisma.ecomCoupon.findFirst({ where: { code }, select: { id: true } })) {
    code = `${src.code}-COPY-${n++}`;
  }

  const created = await prisma.ecomCoupon.create({
    data: {
      title: `${src.title} (Copy)`, code, numberOfTimes: src.numberOfTimes, usedCount: 0,
      discountType: src.discountType, discountValue: src.discountValue, appliesTo: src.appliesTo,
      productId: src.productId, categoryId: src.categoryId, subcategoryId: src.subcategoryId,
      status: src.status, startsAt: src.startsAt, endsAt: src.endsAt, isPaused: true,
    },
    select: { id: true, title: true, code: true },
  });
  await logActivity(req, session.userId, "ecom_coupon_create", `Duplicated Coupon: ${src.title} → ${created.title} (${created.code}) (ID: ${created.id})`);

  return NextResponse.json({ success: true, id: created.id, title: created.title, code: created.code });
}

export const POST = withApiErrors(handlePOST);
