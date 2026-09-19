import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

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

  const data: { orderStatus?: string; paymentStatus?: string } = {};
  if (body.orderStatus !== undefined) data.orderStatus = body.orderStatus;
  if (body.paymentStatus !== undefined) data.paymentStatus = body.paymentStatus;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, message: "Nothing to update" }, { status: 400 });
  }

  // One UPDATE rather than the two the old code issued when both changed.
  await prisma.ecomOrder.update({ where: { id: orderId }, data });

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

  await prisma.ecomOrder.delete({ where: { id: orderId } });
  return NextResponse.json({ success: true });
}
