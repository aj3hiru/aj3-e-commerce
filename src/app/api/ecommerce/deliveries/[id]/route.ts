import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { changeOrderStatus, changePaymentStatus, logOrderEvent, WorkflowError } from "@/lib/order-workflow";

/**
 * Delivery agent actions on an order assigned to them:
 *   start   — picked up: In Progress → Out for Delivery
 *   collect — payment received (Cash / UPI…) → Paid
 *   deliver — Delivered (only after the payment is Paid)
 *   fail    — couldn't deliver: back to In Progress with the reason
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !session.permissions.delivery?.deliver) return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  const orderId = Number((await params).id);
  const order = Number.isInteger(orderId) ? await prisma.ecomOrder.findUnique({ where: { id: orderId }, select: { deliveryAgentId: true, orderStatus: true } }) : null;
  if (!order || order.deliveryAgentId !== session.userId) return NextResponse.json({ success: false, message: "This order isn't assigned to you." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const actor = { userId: session.userId, name: session.username };
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  try {
    switch (body.action) {
      case "start":
        if (order.orderStatus !== "In Progress") throw new WorkflowError(`This order is ${order.orderStatus}.`);
        await changeOrderStatus(orderId, "Out for Delivery", actor);
        return NextResponse.json({ success: true, message: "On the way!" });
      case "collect": {
        const method = ["Cash", "UPI", "Card", "Other"].includes(body.method) ? body.method : "Cash";
        await changePaymentStatus(orderId, "Paid", actor, { method });
        return NextResponse.json({ success: true, message: `Payment collected (${method}).` });
      }
      case "deliver":
        await changeOrderStatus(orderId, "Delivered", actor);
        return NextResponse.json({ success: true, message: "Delivered. Great job!" });
      case "fail":
        if (note.length < 3) throw new WorkflowError("Tell us why it couldn't be delivered.");
        if (order.orderStatus === "Out for Delivery") await changeOrderStatus(orderId, "In Progress", actor, { note: `Delivery attempt failed: ${note}` });
        else await logOrderEvent(prisma, orderId, actor, "note", null, null, `Delivery attempt failed: ${note}`);
        return NextResponse.json({ success: true, message: "Noted — the order desk will follow up." });
      default:
        throw new WorkflowError("Unknown action.");
    }
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ success: false, message: e.message }, { status: 409 });
    console.error("delivery action failed", e);
    return NextResponse.json({ success: false, message: "Couldn't update. Please try again." }, { status: 500 });
  }
}
