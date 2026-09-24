import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";

/** Verified against product.php's POST handler: logged-in customers only. */
export async function POST(req: NextRequest) {
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

  // One review per customer per product (a still-pending one can't be stacked either).
  const already = await prisma.ecomProductReview.findFirst({
    where: { productId, customerId: customer.customerId, status: { in: ["pending", "approved"] } },
    select: { id: true },
  });
  if (already) {
    return NextResponse.json({ success: false, message: "You have already reviewed this product." }, { status: 409 });
  }

  await prisma.ecomProductReview.create({
    data: {
      productId, customerId: customer.customerId, customerName: customer.name,
      rating: Math.round(rating), reviewText: reviewText || null, status: "pending",
    },
  });

  return NextResponse.json({ success: true, message: "Thanks! Your review has been submitted and will appear once approved." });
}
