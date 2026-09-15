import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";

export async function POST(req: NextRequest) {
  const customer = await getCustomerSession();
  if (!customer) {
    return NextResponse.json({ success: false, message: "Please login first.", need_login: true });
  }

  const body = await req.json().catch(() => ({}));
  const productId = Number(body.product_id ?? 0);

  const existing = await prisma.ecomWishlist.findFirst({ where: { customerId: customer.customerId, productId } });
  if (existing) {
    await prisma.ecomWishlist.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true, wishlisted: false });
  }

  await prisma.ecomWishlist.create({ data: { customerId: customer.customerId, productId } });
  return NextResponse.json({ success: true, wishlisted: true });
}
