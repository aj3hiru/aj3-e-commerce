import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { isOrderLocked, paymentChangeBlocked, syncCancelStock } from "@/lib/order-recalc";
import type { Prisma } from "@prisma/client";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "@/lib/order-statuses";

const VALID_ORDER_STATUSES: readonly string[] = ORDER_STATUSES;
const VALID_PAYMENT_STATUSES: readonly string[] = PAYMENT_STATUSES;

/** Verified against order-view.php's update_status / update_payment actions,
 *  including the "Delivered orders are locked" rule. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_orders")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const orderId = Number(id);
  const order = await prisma.ecomOrder.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });

  if (isOrderLocked(order.orderStatus)) {
    return NextResponse.json({ success: false, message: "This order is completed (Delivered) and can no longer be edited." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.action === "update_status" && VALID_ORDER_STATUSES.includes(body.orderStatus)) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.ecomOrder.update({ where: { id: orderId }, data: { orderStatus: body.orderStatus } });
      await syncCancelStock(tx, orderId, order.orderStatus, body.orderStatus);
    });
    return NextResponse.json({ success: true, message: `Order status updated to ${body.orderStatus}.` });
  }

  if (body.action === "update_payment" && VALID_PAYMENT_STATUSES.includes(body.paymentStatus)) {
    const blocked = await paymentChangeBlocked(prisma, orderId);
    if (blocked) return NextResponse.json({ success: false, message: blocked }, { status: 409 });
    await prisma.ecomOrder.update({
      where: { id: orderId },
      data: {
        paymentStatus: body.paymentStatus,
        paidAmount: body.paymentStatus === "Paid" ? order.totalAmount : 0,
      },
    });
    return NextResponse.json({ success: true, message: `Payment status updated to ${body.paymentStatus}.` });
  }

  return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
}
