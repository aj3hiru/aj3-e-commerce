import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import type { Prisma } from "@prisma/client";
import { adjustOrderStock } from "@/lib/order-stock";
import { applyOrderAction, WorkflowError } from "@/lib/order-workflow";

// Single source of truth shared with both status dropdowns, so the UI can never
// offer a value this endpoint would silently drop.
import { isOrderStatus, isPaymentStatus } from "@/lib/order-statuses";

/** Quick status / payment dropdowns on the orders list — same rules as the order page (lib/order-workflow.ts). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !session.permissions.orders?.view) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const orderId = Number((await params).id);
  if (!Number.isInteger(orderId)) return NextResponse.json({ success: false, message: "Invalid order id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (body.orderStatus !== undefined && !isOrderStatus(body.orderStatus)) return NextResponse.json({ success: false, message: "Unknown order status" }, { status: 400 });
  if (body.paymentStatus !== undefined && !isPaymentStatus(body.paymentStatus)) return NextResponse.json({ success: false, message: "Unknown payment status" }, { status: 400 });
  if (body.orderStatus === undefined && body.paymentStatus === undefined) return NextResponse.json({ success: false, message: "Nothing to update" }, { status: 400 });
  try {
    // Payment first, so "Paid + Delivered" in one request passes the payment rule.
    if (body.paymentStatus !== undefined) await applyOrderAction(orderId, { action: "update_payment", paymentStatus: body.paymentStatus }, session);
    if (body.orderStatus !== undefined) await applyOrderAction(orderId, { action: "update_status", orderStatus: body.orderStatus, note: body.note }, session);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ success: false, message: e.message }, { status: 409 });
    console.error("order update failed", e);
    return NextResponse.json({ success: false, message: "Couldn't update the order." }, { status: 500 });
  }
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
