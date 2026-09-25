import { prisma } from "@/lib/db";
import { listDeliveryAgents } from "@/lib/order-workflow";

/** Start of today in India (the store's day), as a Date. */
export function istTodayStart(): Date {
  const ymd = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

export interface DeliveryCard {
  id: number; number: string; status: string; paymentStatus: string; paymentName: string; total: number;
  customer: string; phone: string | null; address: string; mapUrl: string | null; navUrl: string;
  items: string; itemCount: number; assignedAt: string | null; agent: string | null; createdAt: string;
}

const SELECT = {
  id: true, orderNumber: true, orderStatus: true, paymentStatus: true, paymentMethod: true, totalAmount: true, customerName: true,
  shippingAddress: true, shippingLat: true, shippingLng: true, assignedAt: true, createdAt: true,
  customer: { select: { phone: true, address: true } }, deliveryAgent: { select: { username: true } },
  items: { select: { productName: true, qty: true } },
} as const;

type Row = {
  id: number; orderNumber: string; orderStatus: string; paymentStatus: string; paymentMethod: string; totalAmount: unknown; customerName: string;
  shippingAddress: string | null; shippingLat: unknown; shippingLng: unknown; assignedAt: Date | null; createdAt: Date;
  customer: { phone: string | null; address: string | null } | null; deliveryAgent: { username: string } | null; items: { productName: string; qty: number }[];
};

async function methodNames() {
  return new Map((await prisma.ecomPaymentSettings.findMany({ select: { methodKey: true, name: true } })).map((m) => [m.methodKey, m.name]));
}

function toCard(o: Row, names: Map<string, string>): DeliveryCard {
  const address = o.shippingAddress || o.customer?.address || "";
  const hasPin = o.shippingLat !== null && o.shippingLng !== null;
  const dest = hasPin ? `${Number(o.shippingLat)},${Number(o.shippingLng)}` : address.replace(/\n/g, ", ");
  // The address's first line is "Name, phone" — use that phone when the account has none.
  const phone = o.customer?.phone || /(\+?\d[\d\s-]{8,}\d)/.exec(address.split("\n")[0] ?? "")?.[1] || null;
  return {
    id: o.id, number: o.orderNumber, status: o.orderStatus, paymentStatus: o.paymentStatus, paymentName: names.get(o.paymentMethod) ?? o.paymentMethod,
    total: Number(o.totalAmount), customer: o.customerName || "Customer", phone, address,
    mapUrl: hasPin ? `https://www.google.com/maps?q=${dest}` : null,
    navUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`,
    items: o.items.map((i) => `${i.productName} ×${i.qty}`).join(", "), itemCount: o.items.reduce((n, i) => n + i.qty, 0),
    assignedAt: o.assignedAt?.toISOString() ?? null, agent: o.deliveryAgent?.username ?? null, createdAt: o.createdAt.toISOString(),
  };
}

/** The deliveries board: each agent's load and today's work, plus orders waiting for an agent. */
export async function loadDeliveryBoard() {
  const today = istTodayStart();
  const [agents, active, unassigned, deliveredToday, paymentsToday, names] = await Promise.all([
    listDeliveryAgents(),
    prisma.ecomOrder.findMany({ where: { orderType: "online", deliveryAgentId: { not: null }, orderStatus: { in: ["In Progress", "Out for Delivery"] } }, orderBy: { assignedAt: "asc" }, select: { ...SELECT, deliveryAgentId: true } }),
    prisma.ecomOrder.findMany({ where: { orderType: "online", deliveryAgentId: null, orderStatus: "In Progress" }, orderBy: { createdAt: "asc" }, take: 50, select: SELECT }),
    prisma.ecomOrder.groupBy({ by: ["deliveryAgentId"], where: { orderStatus: "Delivered", deliveredAt: { gte: today }, deliveryAgentId: { not: null } }, _count: { _all: true } }),
    prisma.ecomOrderPayment.findMany({ where: { createdAt: { gte: today }, order: { deliveryAgentId: { not: null } } }, select: { amount: true, paymentMethod: true, order: { select: { deliveryAgentId: true } } } }),
    methodNames(),
  ]);
  const board = agents.map((a) => {
    const mine = (active as (Row & { deliveryAgentId: number | null })[]).filter((o) => o.deliveryAgentId === a.id);
    const pays = paymentsToday.filter((p) => p.order.deliveryAgentId === a.id);
    return {
      id: a.id, name: a.name,
      orders: mine.map((o) => toCard(o, names)),
      toCollect: mine.filter((o) => o.paymentStatus !== "Paid").reduce((n, o) => n + Number(o.totalAmount), 0),
      deliveredToday: (deliveredToday as { deliveryAgentId: number | null; _count: { _all: number } }[]).find((d) => d.deliveryAgentId === a.id)?._count._all ?? 0,
      cashToday: pays.filter((p) => p.paymentMethod === "Cash").reduce((n, p) => n + Number(p.amount), 0),
    };
  });
  return { agents: board, unassigned: (unassigned as Row[]).map((o) => toCard(o, names)) };
}
