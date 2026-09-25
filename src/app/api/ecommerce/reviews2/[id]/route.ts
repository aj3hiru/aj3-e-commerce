import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { parseReviewInput } from "@/lib/review2-save";
import { withApiErrors } from "@/lib/api-errors";

type Ctx = { params: Promise<{ id: string }> };

async function guard(ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return { error: NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 }) } as const;
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return { error: NextResponse.json({ success: false, message: "Invalid review." }, { status: 400 }) } as const;
  const review = await prisma.ecomProductReview.findUnique({ where: { id }, select: { id: true, customerName: true, productId: true } });
  if (!review) return { error: NextResponse.json({ success: false, message: "This review no longer exists." }, { status: 404 }) } as const;
  return { session, id, review } as const;
}

/** PUT — save the edit form (rating, text, reviewer, status, product). */
async function handlePUT(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;

  const parsed = parseReviewInput(await req.json().catch(() => null), { requireProduct: true });
  if (!parsed.ok) return NextResponse.json({ success: false, message: parsed.message, field: parsed.field }, { status: 400 });
  const r = parsed.value;

  try {
    const product = await prisma.ecomProduct.findUnique({ where: { id: r.productId }, select: { id: true, name: true } });
    if (!product) return NextResponse.json({ success: false, message: "That product no longer exists. Reload the page and try again.", field: "productId" }, { status: 400 });

    await prisma.ecomProductReview.update({
      where: { id: g.id },
      data: {
        productId: r.productId, customerName: r.customerName, customerId: r.customerId, customerPhone: r.customerPhone,
        orderId: r.orderId, rating: r.rating, reviewText: r.reviewText, status: r.status,
        ...(r.createdAt ? { createdAt: r.createdAt } : {}),
      },
    });
    await logActivity(req, g.session.userId, "ecom_review_update", `Updated Review (ID: ${g.id}) on ${product.name} — ${r.rating}★ by ${r.customerName}`);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("review update failed", e);
    return NextResponse.json({ success: false, message: "Could not save the review. Please try again." }, { status: 500 });
  }
}

/** PATCH { status } — the quick Approve / Reject / Pending switch. */
async function handlePATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;

  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  const status = body.status;
  if (status !== "pending" && status !== "approved" && status !== "rejected") {
    return NextResponse.json({ success: false, message: "Unknown status." }, { status: 400 });
  }

  try {
    await prisma.ecomProductReview.update({ where: { id: g.id }, data: { status } });
    await logActivity(req, g.session.userId, "ecom_review_update", `Review ${status} (ID: ${g.id}) by ${g.review.customerName}`);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: "Could not change the status. Please try again." }, { status: 500 });
  }
}

/** DELETE — remove a review for good. */
async function handleDELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  try {
    await prisma.ecomProductReview.delete({ where: { id: g.id } });
    await logActivity(req, g.session.userId, "ecom_review_delete", `Deleted Review (ID: ${g.id}) by ${g.review.customerName}`);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: "Could not delete the review. Please try again." }, { status: 500 });
  }
}

export const PUT = withApiErrors(handlePUT);
export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
