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
  const reviewText = (body.reviewText ?? "").trim();

  if (!Number.isInteger(productId)) {
    return NextResponse.json({ success: false, message: "Invalid product." }, { status: 400 });
  }

  await prisma.ecomProductReview.create({
    data: { productId, customerName: customer.name, rating, reviewText: reviewText || null, status: "pending" },
  });

  return NextResponse.json({ success: true, message: "Thanks! Your review has been submitted and will appear once approved." });
}
