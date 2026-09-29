import { prisma } from "@/lib/db";
import { hasPermission, type AdminSession } from "@/lib/admin-auth";
import type { LiveEvent } from "@/lib/order-live-shared";

export type { LiveEvent } from "@/lib/order-live-shared";

// Every waiting request shares one "newest event id" lookup per second.
let memo = { at: 0, id: 0, pending: null as Promise<number> | null };
async function newestId(): Promise<number> {
  if (Date.now() - memo.at < 1000) return memo.id;
  if (!memo.pending) {
    memo.pending = prisma.ecomOrderEvent.aggregate({ _max: { id: true } })
      .then((r) => { memo = { at: Date.now(), id: r._max.id ?? 0, pending: null }; return memo.id; })
      .catch(() => { memo.pending = null; return memo.id; });
  }
  return memo.pending;
}

/** Who sees what: order staff see everything; a delivery agent sees only their own deliveries. */
function scope(s: AdminSession): "all" | "agent" | "none" {
  const p = s.permissions;
  if (hasPermission(p, "orders", "view") || hasPermission(p, "ecommerce", "manage_orders") || hasPermission(p, "ecommerce", "manage_billing")) return "all";
  if (hasPermission(p, "delivery", "deliver")) return "agent";
  return "none";
}

async function eventsAfter(after: number, s: AdminSession): Promise<LiveEvent[]> {
  const rows = await prisma.ecomOrderEvent.findMany({
    where: { id: { gt: after } }, orderBy: { id: "asc" }, take: 100,
    select: {
      id: true, orderId: true, type: true, fromValue: true, toValue: true, actorName: true, userId: true, createdAt: true,
      order: { select: { orderNumber: true, deliveryAgentId: true, customerName: true, totalAmount: true, orderType: true } },
    },
  });
  const sc = scope(s);
  return rows
    .filter((r) => sc === "all" || (sc === "agent" && (r.order.deliveryAgentId === s.userId || (r.type === "assign" && r.fromValue === s.username))))
    .map((r) => ({
      id: r.id, orderId: r.orderId, orderNumber: r.order.orderNumber, type: r.type, from: r.fromValue, to: r.toValue, actor: r.actorName, actorId: r.userId,
      agentId: r.order.deliveryAgentId, customer: r.order.customerName ?? "", total: Number(r.order.totalAmount), orderType: r.order.orderType, at: r.createdAt.toISOString(),
    }));
}

/**
 * Long poll: answers as soon as something newer than `after` happens (or
 * after `waitMs` with nothing). `after` = 0 → just the current position.
 */
export async function waitForEvents(after: number, s: AdminSession, waitMs: number, signal?: AbortSignal): Promise<{ last: number; events: LiveEvent[] }> {
  const start = Date.now();
  if (after <= 0) return { last: await newestId(), events: [] };
  for (;;) {
    const top = await newestId();
    if (top > after) {
      const events = await eventsAfter(after, s);
      const last = events.length ? Math.max(top, events[events.length - 1].id) : top;
      return { last: events.length === 100 ? events[99].id : last, events };
    }
    if (Date.now() - start >= waitMs || signal?.aborted) return { last: after, events: [] };
    await new Promise((r) => setTimeout(r, 1200));
  }
}
