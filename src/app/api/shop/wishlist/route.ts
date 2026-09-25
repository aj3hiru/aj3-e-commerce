import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";
import { withApiErrors } from "@/lib/api-errors";

async function handlePOST(req: NextRequest) {
  const customer = await getCustomerSession();
  if (!customer) {
    return NextResponse.json({ success: false, message: "Please login first.", need_login: true });
  }

  const body = await req.json().catch(() => ({}));
  const productId = Number(body.product_id ?? 0);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ success: false, message: "Invalid product." }, { status: 400 });
  }

  const existing = await prisma.ecomWishlist.findFirst({ where: { customerId: customer.customerId, productId } });
  if (existing) {
    await prisma.ecomWishlist.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true, wishlisted: false });
  }

  const product = await prisma.ecomProduct.findFirst({ where: { id: productId, status: "active" }, select: { id: true } });
  if (!product) return NextResponse.json({ success: false, message: "Product not found." }, { status: 404 });

  await prisma.ecomWishlist.create({ data: { customerId: customer.customerId, productId } });
  return NextResponse.json({ success: true, wishlisted: true });
}

export const POST = withApiErrors(handlePOST);
