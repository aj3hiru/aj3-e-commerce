import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isOrderLocked, paymentChangeBlocked, syncCancelStock } from "@/lib/order-recalc";
import { isOrderStatus, isPaymentStatus } from "@/lib/order-statuses";
import { normalizePermissions } from "@/lib/permissions";

/**
 * The one place order rules live, used by the admin order page, the orders
 * list, the order desk and the delivery agents' screen:
 *  - Delivered needs the payment to be Paid first (Cash on Delivery: collect, then deliver).
 *  - Out for Delivery needs a delivery agent when the store has any.
 *  - Delivered orders are locked.
 *  - Every change is written to the order history with who made it.
 */

export class WorkflowError extends Error {}
export interface Actor { userId: number | null; name: string }
type Tx = Prisma.TransactionClient;

export async function logOrderEvent(tx: Tx | typeof prisma, orderId: number, actor: Actor, type: string, fromValue: string | null, toValue: string | null, note?: string | null) {
  await tx.ecomOrderEvent.create({ data: { orderId, type, fromValue, toValue, note: note?.slice(0, 500) || null, userId: actor.userId, actorName: actor.name.slice(0, 100) } });
}

/** Active staff who can deliver (their own permissions or role say so). */
export async function listDeliveryAgents(): Promise<{ id: number; name: string }[]> {
  const users = await prisma.user.findMany({ where: { status: "active" }, select: { id: true, username: true, role: true, permissions: true }, orderBy: { username: "asc" } });
  return users.filter((u) => normalizePermissions(u.permissions, u.role).delivery?.deliver && u.role !== "admin").map((u) => ({ id: u.id, name: u.username }));
}

export async function changeOrderStatus(orderId: number, to: string, actor: Actor, opts: { note?: string; allowWithoutAgent?: boolean } = {}) {
  if (!isOrderStatus(to)) throw new WorkflowError("Unknown order status.");
  return prisma.$transaction(async (tx) => {
    const o = await tx.ecomOrder.findUnique({ where: { id: orderId }, select: { orderStatus: true, paymentStatus: true, orderType: true, deliveryAgentId: true } });
    if (!o) throw new WorkflowError("Order not found.");
    if (o.orderStatus === to) return o.orderStatus;
    if (isOrderLocked(o.orderStatus)) throw new WorkflowError("This order is already Delivered and can't be changed.");
    if (to === "Delivered" && o.paymentStatus !== "Paid") {
      throw new WorkflowError("Payment not received yet — mark the payment as Paid first (collect the cash for Cash on Delivery), then mark it Delivered.");
    }
    if (to === "Out for Delivery" && o.orderType === "online" && !o.deliveryAgentId && !opts.allowWithoutAgent) {
      const agents = await listDeliveryAgents();
      if (agents.length > 0) throw new WorkflowError("Assign a delivery agent first, then send it out for delivery.");
    }
    const note = opts.note?.trim() || null;
    await tx.ecomOrder.update({
      where: { id: orderId },
      data: {
        orderStatus: to,
        ...(to === "Delivered" ? { deliveredAt: new Date() } : {}),
        ...(to === "Canceled" ? { cancelReason: note } : o.orderStatus === "Canceled" ? { cancelReason: null } : {}),
      },
    });
    await syncCancelStock(tx, orderId, o.orderStatus, to);
    await logOrderEvent(tx, orderId, actor, "status", o.orderStatus, to, note);
    return to;
  });
}

export async function changePaymentStatus(orderId: number, to: string, actor: Actor, opts: { method?: string; note?: string } = {}) {
  if (!isPaymentStatus(to)) throw new WorkflowError("Unknown payment status.");
  const blocked = await paymentChangeBlocked(prisma, orderId);
  if (blocked) throw new WorkflowError(blocked);
  return prisma.$transaction(async (tx) => {
    const o = await tx.ecomOrder.findUnique({ where: { id: orderId }, select: { orderStatus: true, paymentStatus: true, totalAmount: true } });
    if (!o) throw new WorkflowError("Order not found.");
    if (o.paymentStatus === to) return to;
    if (isOrderLocked(o.orderStatus)) throw new WorkflowError("This order is already Delivered and can't be changed.");
    await tx.ecomOrder.update({ where: { id: orderId }, data: { paymentStatus: to, paidAmount: to === "Paid" ? o.totalAmount : 0 } });
    // A collected payment is recorded with how it was paid (cash / UPI), for the day's cash report.
    if (to === "Paid" && opts.method) await tx.ecomOrderPayment.create({ data: { orderId, paymentMethod: opts.method, amount: o.totalAmount } });
    if (to === "Unpaid") await tx.ecomOrderPayment.deleteMany({ where: { orderId } });
    await logOrderEvent(tx, orderId, actor, "payment", o.paymentStatus, to, opts.method ? `Collected by ${opts.method}${opts.note ? ` — ${opts.note}` : ""}` : opts.note);
    return to;
  });
}

export async function assignDeliveryAgent(orderId: number, agentId: number | null, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const o = await tx.ecomOrder.findUnique({ where: { id: orderId }, select: { orderStatus: true, deliveryAgentId: true, deliveryAgent: { select: { username: true } } } });
    if (!o) throw new WorkflowError("Order not found.");
    if (isOrderLocked(o.orderStatus) || o.orderStatus === "Canceled") throw new WorkflowError(`This order is ${o.orderStatus} — it can't be assigned.`);
    let name: string | null = null;
    if (agentId) {
      const agent = (await listDeliveryAgents()).find((a) => a.id === agentId);
      if (!agent) throw new WorkflowError("That person isn't an active delivery agent.");
      name = agent.name;
    }
    await tx.ecomOrder.update({ where: { id: orderId }, data: { deliveryAgentId: agentId, assignedAt: agentId ? new Date() : null } });
    await logOrderEvent(tx, orderId, actor, "assign", o.deliveryAgent?.username ?? null, name, null);
    return name;
  });
}

/** Maps a request body to the workflow, checking the caller's fine-grained order permissions. */
export async function applyOrderAction(orderId: number, body: Record<string, unknown>, session: { userId: number; username: string; permissions: Record<string, Record<string, boolean>> }): Promise<string> {
  const can = (k: string) => !!session.permissions.orders?.[k];
  const actor = { userId: session.userId, name: session.username };
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;

  if (body.action === "assign") {
    if (!can("assign_delivery")) throw new WorkflowError("You don't have permission to assign delivery agents.");
    const agentId = body.agentId === null || body.agentId === "" ? null : Number(body.agentId);
    const name = await assignDeliveryAgent(orderId, agentId && Number.isInteger(agentId) ? agentId : null, actor);
    return name ? `Assigned to ${name}.` : "Delivery agent removed.";
  }
  if (body.action === "update_payment") {
    if (!can("mark_paid")) throw new WorkflowError("You don't have permission to change payments.");
    await changePaymentStatus(orderId, String(body.paymentStatus), actor, { method: typeof body.method === "string" ? body.method.slice(0, 20) : undefined, note });
    return `Payment marked ${body.paymentStatus}.`;
  }
  if (body.action === "update_status") {
    const to = String(body.orderStatus);
    const current = (await prisma.ecomOrder.findUnique({ where: { id: orderId }, select: { orderStatus: true } }))?.orderStatus;
    const isDecision = current === "Pending" && (to === "In Progress" || to === "Canceled");
    const ok = to === "Canceled" ? can("cancel") || (isDecision && can("accept_reject")) : isDecision ? can("accept_reject") || can("update_status") : can("update_status");
    if (!ok) throw new WorkflowError("You don't have permission to make this change.");
    await changeOrderStatus(orderId, to, actor, { note });
    return to === "In Progress" && current === "Pending" ? "Order accepted." : to === "Canceled" ? (current === "Pending" ? "Order rejected." : "Order cancelled.") : `Order marked ${to}.`;
  }
  if (body.action === "note") {
    if (!can("view") || !note?.trim()) throw new WorkflowError("Write a note first.");
    await logOrderEvent(prisma, orderId, actor, "note", null, null, note);
    return "Note added.";
  }
  throw new WorkflowError("Unknown action.");
}
