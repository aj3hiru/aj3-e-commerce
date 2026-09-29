import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { changeOrderStatus, changePaymentStatus, logOrderEvent, WorkflowError } from "@/lib/order-workflow";
import { withApiErrors } from "@/lib/api-errors";

/**
 * Delivery agent actions on an order assigned to them:
 *   start   — picked up: In Progress → Out for Delivery
 *   collect — payment received (Cash / UPI…) → Paid
 *   deliver — Delivered (only after the payment is Paid)
 *   complete — collect the payment (split across Cash / UPI / Other) and mark Delivered in one step
 *   fail    — couldn't deliver now: back to In Progress with the reason (retry later)
 *   cancel  — cancel the order with a reason (refused, not answering, damaged…)
 */
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !session.permissions.delivery?.deliver) return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  const orderId = Number((await params).id);
  const order = Number.isInteger(orderId) ? await prisma.ecomOrder.findUnique({ where: { id: orderId }, select: { deliveryAgentId: true, orderStatus: true, paymentStatus: true, totalAmount: true } }) : null;
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
      case "complete": {
        if (!["In Progress", "Out for Delivery"].includes(order.orderStatus)) throw new WorkflowError(`This order is ${order.orderStatus}.`);
        if (order.paymentStatus !== "Paid") {
          const rows = (Array.isArray(body.payments) ? body.payments : [])
            .map((p: { method?: unknown; amount?: unknown }) => ({ method: ["Cash", "UPI", "Card", "Other"].includes(String(p.method)) ? String(p.method) : "Other", amount: Math.round(Number(p.amount) * 100) / 100 }))
            .filter((p: { amount: number }) => Number.isFinite(p.amount) && p.amount > 0);
          const sum = rows.reduce((n: number, p: { amount: number }) => n + p.amount, 0);
          const total = Number(order.totalAmount);
          if (!rows.length) throw new WorkflowError("Enter how much you collected.");
          if (Math.abs(sum - total) > 0.5) throw new WorkflowError(`Collected ₹${sum.toFixed(2)} but the order is ₹${total.toFixed(2)}. The amounts must add up to the order total.`);
          await changePaymentStatus(orderId, "Paid", actor, { method: rows.length === 1 ? rows[0].method : "Split", split: rows });
        }
        await changeOrderStatus(orderId, "Delivered", actor, { note: note || undefined });
        return NextResponse.json({ success: true, message: "Delivered. Great job!" });
      }
      case "deliver":
        await changeOrderStatus(orderId, "Delivered", actor);
        return NextResponse.json({ success: true, message: "Delivered. Great job!" });
      case "fail":
        if (note.length < 3) throw new WorkflowError("Tell us why it couldn't be delivered.");
        if (order.orderStatus === "Out for Delivery") await changeOrderStatus(orderId, "In Progress", actor, { note: `Delivery attempt failed: ${note}` });
        else await logOrderEvent(prisma, orderId, actor, "note", null, null, `Delivery attempt failed: ${note}`);
        return NextResponse.json({ success: true, message: "Noted — the order desk will follow up." });
      case "cancel":
        if (note.length < 3) throw new WorkflowError("Choose or write the reason for cancelling.");
        if (!["In Progress", "Out for Delivery"].includes(order.orderStatus)) throw new WorkflowError(`This order is ${order.orderStatus}.`);
        if (order.paymentStatus === "Paid") throw new WorkflowError("The payment is already collected — ask the order desk to cancel and refund it.");
        await changeOrderStatus(orderId, "Canceled", actor, { note: `Cancelled by delivery agent: ${note}` });
        return NextResponse.json({ success: true, message: "Order cancelled." });
      default:
        throw new WorkflowError("Unknown action.");
    }
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ success: false, message: e.message }, { status: 409 });
    console.error("delivery action failed", e);
    return NextResponse.json({ success: false, message: "Couldn't update. Please try again." }, { status: 500 });
  }
}

export const POST = withApiErrors(handlePOST);
