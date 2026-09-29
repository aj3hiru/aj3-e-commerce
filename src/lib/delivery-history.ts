import { prisma } from "@/lib/db";
import { listDeliveryAgents } from "@/lib/order-workflow";

/**
 * Deliveries Board → History and Report: every online order handed to a
 * delivery agent in the chosen dates, what happened to it (delivered, failed
 * attempts, cancelled, still out) and each agent's totals. India time.
 */

export type DeliveryStatus = "all" | "delivered" | "failed" | "canceled" | "active";
export interface DeliveryFilters { from: string; to: string; preset: string; agent: number | null; status: DeliveryStatus; q: string }

export interface DeliveryHistoryRow {
  id: number; number: string; customer: string; phone: string | null; address: string; agentId: number | null; agent: string | null;
  status: string; paymentStatus: string; paymentMethod: string; total: number; collected: { method: string; amount: number }[];
  assignedAt: string | null; deliveredAt: string | null; finishedAt: string | null; minutes: number | null;
  failedAttempts: { at: string; note: string }[]; cancelReason: string | null; items: number;
}

export interface AgentReportRow {
  id: number | null; name: string; assigned: number; delivered: number; failed: number; canceled: number; active: number;
  collected: number; cash: number; upi: number; other: number; avgMinutes: number | null; successRate: number | null;
}

const IST = 330 * 60_000;
const ymd = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const isYmd = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parseDeliveryFilters(sp: Record<string, string | undefined>): DeliveryFilters {
  const today = ymd(new Date());
  const shift = (days: number) => ymd(new Date(Date.now() - days * 86_400_000));
  const dow = (new Date(Date.now() + IST).getUTCDay() + 6) % 7; // Monday = 0
  const preset = sp.range ?? "today";
  const ranges: Record<string, [string, string]> = {
    today: [today, today], yesterday: [shift(1), shift(1)], week: [shift(dow), today], "7d": [shift(6), today],
    month: [`${today.slice(0, 8)}01`, today], "30d": [shift(29), today],
  };
  let [from, to] = ranges[preset] ?? [isYmd(sp.from) ? sp.from! : today, isYmd(sp.to) ? sp.to! : today];
  if (to < from) [from, to] = [to, from];
  const status = (["all", "delivered", "failed", "canceled", "active"] as DeliveryStatus[]).includes(sp.status as DeliveryStatus) ? (sp.status as DeliveryStatus) : "all";
  return { from, to, preset: ranges[preset] ? preset : "custom", agent: /^\d+$/.test(sp.agent ?? "") ? Number(sp.agent) : null, status, q: (sp.q ?? "").trim().slice(0, 80) };
}

export async function loadDeliveryHistory(f: DeliveryFilters) {
  const start = new Date(`${f.from}T00:00:00.000+05:30`), end = new Date(`${f.to}T23:59:59.999+05:30`);
  const inRange = { gte: start, lte: end };
  const [agents, failEvents, cancelEvents] = await Promise.all([
    listDeliveryAgents(),
    prisma.ecomOrderEvent.findMany({ where: { createdAt: inRange, note: { startsWith: "Delivery attempt failed" } }, select: { orderId: true, note: true, createdAt: true } }),
    prisma.ecomOrderEvent.findMany({ where: { createdAt: inRange, type: "status", toValue: "Canceled" }, select: { orderId: true, createdAt: true } }),
  ]);
  const failedIds = [...new Set(failEvents.map((e) => e.orderId))];
  const canceledAt = new Map(cancelEvents.map((e) => [e.orderId, e.createdAt]));
  const orders = await prisma.ecomOrder.findMany({
    where: {
      orderType: "online",
      OR: [
        { deliveryAgentId: { not: null }, assignedAt: inRange },
        { deliveryAgentId: { not: null }, deliveredAt: inRange },
        ...(canceledAt.size ? [{ deliveryAgentId: { not: null }, orderStatus: "Canceled", id: { in: [...canceledAt.keys()] } }] : []),
        ...(failedIds.length ? [{ id: { in: failedIds } }] : []),
      ],
      ...(f.agent ? { deliveryAgentId: f.agent } : {}),
    },
    orderBy: { id: "desc" },
    take: 3000,
    select: {
      id: true, orderNumber: true, customerName: true, shippingAddress: true, orderStatus: true, paymentStatus: true, paymentMethod: true, totalAmount: true,
      assignedAt: true, deliveredAt: true, cancelReason: true, deliveryAgentId: true,
      deliveryAgent: { select: { username: true } }, customer: { select: { phone: true } },
      payments: { select: { paymentMethod: true, amount: true } }, items: { select: { qty: true } },
    },
  });

  const failsBy = new Map<number, { at: string; note: string }[]>();
  for (const e of failEvents) {
    const list = failsBy.get(e.orderId) ?? [];
    list.push({ at: e.createdAt.toISOString(), note: (e.note ?? "").replace(/^Delivery attempt failed:?\s*/, "") });
    failsBy.set(e.orderId, list);
  }

  const q = f.q.toLowerCase();
  const all: DeliveryHistoryRow[] = orders.map((o) => {
    const minutes = o.assignedAt && o.deliveredAt ? Math.max(0, Math.round((o.deliveredAt.getTime() - o.assignedAt.getTime()) / 60_000)) : null;
    const finished = o.orderStatus === "Delivered" ? o.deliveredAt : o.orderStatus === "Canceled" ? canceledAt.get(o.id) ?? null : null;
    return {
      id: o.id, number: o.orderNumber, customer: o.customerName || "Customer", phone: o.customer?.phone ?? null, address: (o.shippingAddress ?? "").replace(/\n/g, ", "),
      agentId: o.deliveryAgentId, agent: o.deliveryAgent?.username ?? null, status: o.orderStatus, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod,
      total: Number(o.totalAmount), collected: o.payments.map((p) => ({ method: p.paymentMethod, amount: Number(p.amount) })),
      assignedAt: o.assignedAt?.toISOString() ?? null, deliveredAt: o.deliveredAt?.toISOString() ?? null, finishedAt: finished?.toISOString() ?? null, minutes,
      failedAttempts: failsBy.get(o.id) ?? [], cancelReason: o.cancelReason, items: o.items.reduce((n, i) => n + i.qty, 0),
    };
  });

  const matches = (r: DeliveryHistoryRow) =>
    (f.status === "all" ||
      (f.status === "delivered" && r.status === "Delivered") ||
      (f.status === "canceled" && r.status === "Canceled") ||
      (f.status === "failed" && r.failedAttempts.length > 0) ||
      (f.status === "active" && (r.status === "In Progress" || r.status === "Out for Delivery"))) &&
    (!q || `${r.number} ${r.customer} ${r.phone ?? ""} ${r.address} ${r.agent ?? ""}`.toLowerCase().includes(q));
  const rows = all.filter(matches);

  // Per agent (every agent is listed, even with nothing in these dates).
  const byAgent = new Map<number | null, AgentReportRow>();
  const blank = (id: number | null, name: string): AgentReportRow => ({ id, name, assigned: 0, delivered: 0, failed: 0, canceled: 0, active: 0, collected: 0, cash: 0, upi: 0, other: 0, avgMinutes: null, successRate: null });
  for (const a of agents) if (!f.agent || a.id === f.agent) byAgent.set(a.id, blank(a.id, a.name));
  const mins = new Map<number | null, number[]>();
  for (const r of all) {
    const rep = byAgent.get(r.agentId) ?? byAgent.set(r.agentId, blank(r.agentId, r.agent ?? "No agent")).get(r.agentId)!;
    if (r.assignedAt && r.assignedAt >= start.toISOString() && r.assignedAt <= end.toISOString()) rep.assigned++;
    if (r.status === "Delivered" && r.deliveredAt) {
      rep.delivered++;
      if (r.minutes !== null) mins.set(r.agentId, [...(mins.get(r.agentId) ?? []), r.minutes]);
      for (const p of r.collected) {
        rep.collected += p.amount;
        if (p.method === "Cash") rep.cash += p.amount;
        else if (p.method === "UPI") rep.upi += p.amount;
        else rep.other += p.amount;
      }
    }
    if (r.status === "Canceled") rep.canceled++;
    if (r.status === "In Progress" || r.status === "Out for Delivery") rep.active++;
    rep.failed += r.failedAttempts.length;
  }
  for (const [id, rep] of byAgent) {
    const m = mins.get(id) ?? [];
    rep.avgMinutes = m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : null;
    const finished = rep.delivered + rep.canceled;
    rep.successRate = finished ? Math.round((rep.delivered / finished) * 100) : null;
    rep.collected = Math.round(rep.collected * 100) / 100;
  }
  const report = [...byAgent.values()].sort((a, b) => b.delivered - a.delivered || a.name.localeCompare(b.name));
  const totals = report.reduce((t, r) => ({
    assigned: t.assigned + r.assigned, delivered: t.delivered + r.delivered, failed: t.failed + r.failed, canceled: t.canceled + r.canceled,
    active: t.active + r.active, collected: t.collected + r.collected,
  }), { assigned: 0, delivered: 0, failed: 0, canceled: 0, active: 0, collected: 0 });

  return { filters: f, agents, rows, report, totals };
}
