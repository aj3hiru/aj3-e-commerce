import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { parseReviewInput } from "@/lib/review2-save";
import { withApiErrors } from "@/lib/api-errors";

/** POST /api/ecommerce/reviews2 — add a review by hand (Product Reviews 2). */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const parsed = parseReviewInput(await req.json().catch(() => null), { requireProduct: true });
  if (!parsed.ok) return NextResponse.json({ success: false, message: parsed.message, field: parsed.field }, { status: 400 });
  const r = parsed.value;

  try {
    const product = await prisma.ecomProduct.findUnique({ where: { id: r.productId }, select: { id: true, name: true } });
    if (!product) return NextResponse.json({ success: false, message: "That product no longer exists. Reload the page and try again.", field: "productId" }, { status: 400 });

    if (r.customerId !== null) {
      const customer = await prisma.ecomCustomer.findUnique({ where: { id: r.customerId }, select: { id: true } });
      if (!customer) return NextResponse.json({ success: false, message: "That customer no longer exists. Reload the page and try again.", field: "customerId" }, { status: 400 });
    }
    if (r.orderId !== null) {
      const order = await prisma.ecomOrder.findUnique({ where: { id: r.orderId }, select: { id: true } });
      if (!order) return NextResponse.json({ success: false, message: "That order number was not found.", field: "orderId" }, { status: 400 });
    }

    const created = await prisma.ecomProductReview.create({
      data: {
        productId: r.productId, customerName: r.customerName, customerId: r.customerId, customerPhone: r.customerPhone,
        orderId: r.orderId, rating: r.rating, reviewText: r.reviewText, status: r.status,
        ...(r.createdAt ? { createdAt: r.createdAt } : {}),
      },
      select: { id: true },
    });

    await logActivity(req, session.userId, "ecom_review_create", `Added Review: ${product.name} — ${r.rating}★ by ${r.customerName} (ID: ${created.id})`);
    return NextResponse.json({ success: true, id: created.id });
  } catch (e) {
    console.error("review create failed", e);
    return NextResponse.json({ success: false, message: setupHint(e) }, { status: 500 });
  }
}

/** The new optional columns are the one likely setup problem — say so plainly. */
function setupHint(e: unknown): string {
  const text = e instanceof Error ? e.message : "";
  return /Unknown column|does not exist|P2022|P2021/i.test(text)
    ? "The review table is missing its new columns. On the server run: npx prisma db execute --file prisma/reviews2.sql --schema prisma/schema.prisma"
    : "Could not save the review. Please try again.";
}

export const POST = withApiErrors(handlePOST);
