import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";
import { withApiErrors } from "@/lib/api-errors";

/**
 * Reviews come only from customers who bought the product: one review for each
 * delivered order (online or store bill) that has it. `left` is how many more
 * they can write (null = never bought it).
 */
async function reviewSlot(customerId: number, productId: number): Promise<{ orderId: number | null; left: number | null }> {
  const [orders, reviews] = await Promise.all([
    prisma.ecomOrder.findMany({
      where: { customerId, orderStatus: "Delivered", items: { some: { productId } } },
      orderBy: { createdAt: "asc" }, select: { id: true }, take: 200,
    }),
    prisma.ecomProductReview.findMany({ where: { productId, customerId, status: { in: ["pending", "approved"] } }, select: { orderId: true } }),
  ]);
  if (!orders.length) return { orderId: null, left: null };
  const left = Math.max(0, orders.length - reviews.length);
  if (!left) return { orderId: null, left: 0 };
  const used = new Set(reviews.map((r) => r.orderId));
  return { orderId: (orders.find((o) => !used.has(o.id)) ?? orders[orders.length - 1]).id, left };
}

/** Can the signed-in shopper review this product right now? (The form shows only when they can.) */
async function handleGET(req: NextRequest) {
  const productId = Number(req.nextUrl.searchParams.get("productId"));
  const customer = await getCustomerSession();
  if (!customer || !Number.isInteger(productId)) return NextResponse.json({ success: true, canReview: false }, { headers: { "Cache-Control": "no-store" } });
  const { orderId } = await reviewSlot(customer.customerId, productId);
  return NextResponse.json({ success: true, canReview: !!orderId }, { headers: { "Cache-Control": "no-store" } });
}

/** Verified against product.php's POST handler: logged-in customers who bought the product only. */
async function handlePOST(req: NextRequest) {
  const customer = await getCustomerSession();
  if (!customer) {
    return NextResponse.json({ success: false, message: "Please login to write a review." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const productId = Number(body.productId);
  const rating = Math.max(1, Math.min(5, Number(body.rating ?? 5)));
  const reviewText = String(body.reviewText ?? "").trim().slice(0, 2000);

  if (!Number.isInteger(productId) || !Number.isFinite(rating)) {
    return NextResponse.json({ success: false, message: "Invalid product." }, { status: 400 });
  }
  const product = await prisma.ecomProduct.findFirst({ where: { id: productId, status: "active" }, select: { id: true } });
  if (!product) {
    return NextResponse.json({ success: false, message: "Invalid product." }, { status: 400 });
  }

  const { orderId, left } = await reviewSlot(customer.customerId, productId);
  if (!orderId) {
    return NextResponse.json({
      success: false,
      message: left === null ? "Only customers who bought this product can review it." : "You have already reviewed each purchase of this product — buy it again to write another review.",
    }, { status: 403 });
  }

  await prisma.ecomProductReview.create({
    data: {
      productId, customerId: customer.customerId, customerName: customer.name, orderId,
      rating: Math.round(rating), reviewText: reviewText || null, status: "pending",
    },
  });

  return NextResponse.json({ success: true, message: "Thanks! Your review has been submitted and will appear once approved." });
}

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);
