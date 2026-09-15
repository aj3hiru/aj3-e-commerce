import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

const VALID_ORDER_STATUSES = ["Pending", "In Progress", "Delivered", "Canceled"];
const VALID_PAYMENT_STATUSES = ["Unpaid", "Paid"];

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

  if (body.orderStatus && VALID_ORDER_STATUSES.includes(body.orderStatus)) {
    await prisma.ecomOrder.update({ where: { id: orderId }, data: { orderStatus: body.orderStatus } });
  }
  if (body.paymentStatus && VALID_PAYMENT_STATUSES.includes(body.paymentStatus)) {
    await prisma.ecomOrder.update({ where: { id: orderId }, data: { paymentStatus: body.paymentStatus } });
  }

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
