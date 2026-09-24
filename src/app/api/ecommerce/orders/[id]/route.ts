import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import type { Prisma } from "@prisma/client";
import { isOrderLocked, paymentChangeBlocked, syncCancelStock } from "@/lib/order-recalc";
import { adjustOrderStock } from "@/lib/order-stock";

// Single source of truth shared with both status dropdowns, so the UI can never
// offer a value this endpoint would silently drop.
import { isOrderStatus, isPaymentStatus } from "@/lib/order-statuses";

/** Verified against the set_order_status / set_payment_status GET-based quick
 *  toggles in orders.php. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_orders")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ success: false, message: "Invalid order id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  // The PHP silently ignored an unrecognised status (in_array guard, then a
  // redirect). Returning 400 instead means the caller can tell a rejected
  // update apart from an applied one and avoid showing a value that was never
  // saved — the dashboard table relies on this.
  if (body.orderStatus !== undefined && !isOrderStatus(body.orderStatus)) {
    return NextResponse.json({ success: false, message: "Unknown order status" }, { status: 400 });
  }
  if (body.paymentStatus !== undefined && !isPaymentStatus(body.paymentStatus)) {
    return NextResponse.json({ success: false, message: "Unknown payment status" }, { status: 400 });
  }

  if (body.orderStatus === undefined && body.paymentStatus === undefined) {
    return NextResponse.json({ success: false, message: "Nothing to update" }, { status: 400 });
  }

  const order = await prisma.ecomOrder.findUnique({ where: { id: orderId }, select: { orderStatus: true, totalAmount: true } });
  if (!order) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });

  // Same "Delivered orders are locked" rule the order detail page enforces —
  // the list's quick dropdown used to bypass it.
  if (body.orderStatus !== undefined && body.orderStatus !== order.orderStatus && isOrderLocked(order.orderStatus)) {
    return NextResponse.json({ success: false, message: "This order is completed (Delivered) and its status can no longer be changed." }, { status: 409 });
  }
  if (body.paymentStatus !== undefined) {
    const blocked = await paymentChangeBlocked(prisma, orderId);
    if (blocked) return NextResponse.json({ success: false, message: blocked }, { status: 409 });
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const data: { orderStatus?: string; paymentStatus?: string; paidAmount?: Prisma.Decimal | number } = {};
    if (body.orderStatus !== undefined) data.orderStatus = body.orderStatus;
    if (body.paymentStatus !== undefined) {
      data.paymentStatus = body.paymentStatus;
      data.paidAmount = body.paymentStatus === "Paid" ? order.totalAmount : 0;
    }
    await tx.ecomOrder.update({ where: { id: orderId }, data });
    if (body.orderStatus !== undefined) await syncCancelStock(tx, orderId, order.orderStatus, body.orderStatus);
  });

  return NextResponse.json({ success: true });
}

/** Verified against the POST action==='delete' handler in orders.php. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_orders")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ success: false, message: "Invalid order id" }, { status: 400 });
  }

  const order = await prisma.ecomOrder.findUnique({ where: { id: orderId }, select: { orderStatus: true } });
  if (!order) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });

  // Money already collected against this order's due has receipts attached —
  // deleting it would silently erase those payments.
  const paidDue = await prisma.ecomCredit.count({ where: { orderId, amountPaid: { gt: 0 } } });
  if (paidDue > 0) {
    return NextResponse.json(
      { success: false, message: "This order has due payments recorded against it and can't be deleted. Cancel it instead." },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // A deleted (not-already-canceled) order gives its stock back.
      if (order.orderStatus !== "Canceled") await adjustOrderStock(tx, orderId, 1);
      // ecom_credits has no ON DELETE CASCADE, so the unpaid due must go first or
      // the delete fails; campaign sale rows are plain ids and would be orphaned.
      await tx.ecomCredit.deleteMany({ where: { orderId } });
      await tx.ecomCampaignSale.deleteMany({ where: { orderId } });
      await tx.ecomOrder.delete({ where: { id: orderId } });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unexpected error";
    return NextResponse.json({ success: false, message: `Delete failed: ${message}` }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
