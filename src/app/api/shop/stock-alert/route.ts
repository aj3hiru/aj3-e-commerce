import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";
import { parseEndpoint } from "@/lib/push-subscriptions";
import { withApiErrors } from "@/lib/api-errors";

const MAX_PENDING = 50;

/**
 * "Notify me" on an out-of-stock product: { productId, sizeId?, endpoint? }.
 * The endpoint must be a browser already subscribed to push (/api/push2/subscribe);
 * a signed-in customer is also remembered, so any of their browsers gets it.
 */
async function handlePOST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const productId = Number(body.productId);
  const sizeId = Number(body.sizeId) > 0 ? Number(body.sizeId) : null;
  if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ success: false, message: "Invalid product." }, { status: 400 });

  const raw = parseEndpoint(body.endpoint);
  const endpoint = raw && (await prisma.pushSubscription.findUnique({ where: { endpoint: raw }, select: { id: true } })) ? raw : null;
  const customerId = (await getCustomerSession().catch(() => null))?.customerId ?? null;
  if (!endpoint && !customerId) {
    return NextResponse.json({ success: false, message: "Please allow notifications so we can tell you when it's back." }, { status: 400 });
  }
  const product = await prisma.ecomProduct.findFirst({ where: { id: productId, status: "active" }, select: { id: true } });
  if (!product) return NextResponse.json({ success: false, message: "Invalid product." }, { status: 400 });

  const who = endpoint ? { endpoint } : { customerId };
  const already = await prisma.ecomStockAlert.findFirst({ where: { productId, sizeId, notifiedAt: null, ...who }, select: { id: true } });
  if (!already) {
    if ((await prisma.ecomStockAlert.count({ where: { notifiedAt: null, ...who } })) >= MAX_PENDING) {
      return NextResponse.json({ success: false, message: "You're already waiting for a lot of products." }, { status: 429 });
    }
    await prisma.ecomStockAlert.create({ data: { productId, sizeId, endpoint, customerId } });
  }
  return NextResponse.json({ success: true, message: "We'll send you a notification as soon as it's back in stock." });
}

export const POST = withApiErrors(handlePOST);
