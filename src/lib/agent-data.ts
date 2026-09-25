import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { istTodayStart } from "@/lib/deliveries";

/** Data for the delivery agent app (/agent). Everything is limited to orders assigned to this agent. */

export interface AgentOrderCard {
  id: number; number: string; status: string; paid: boolean; paymentName: string; total: number; customer: string; phone: string | null;
  area: string; address: string; itemCount: number; hasPin: boolean; assignedAt: string | null; deliveredAt: string | null; cancelReason: string | null;
}

type Row = {
  id: number; orderNumber: string; orderStatus: string; paymentStatus: string; paymentMethod: string; totalAmount: unknown; customerName: string;
  shippingAddress: string | null; shippingLat: unknown; assignedAt: Date | null; deliveredAt: Date | null; cancelReason: string | null;
  customer: { phone: string | null; address: string | null } | null; items: { qty: number }[];
};
const SELECT = {
  id: true, orderNumber: true, orderStatus: true, paymentStatus: true, paymentMethod: true, totalAmount: true, customerName: true,
  shippingAddress: true, shippingLat: true, assignedAt: true, deliveredAt: true, cancelReason: true,
  customer: { select: { phone: true, address: true } }, items: { select: { qty: true } },
} as const;

export const phoneFromAddress = (address: string) => /(\+?\d[\d\s-]{8,}\d)/.exec(address.split("\n")[0] ?? "")?.[1] ?? null;
/** The saved-address format starts with "Recipient name, phone" — that's who the parcel goes to. */
export function recipient(address: string, accountName: string, accountPhone: string | null) {
  const first = address.split("\n")[0] ?? "";
  const phone = phoneFromAddress(address);
  const name = phone ? first.replace(phone, "").replace(/[,\s]+$/, "").trim() : "";
  return { name: name || accountName || "Customer", phone: phone || accountPhone, orderedBy: name && accountName && name !== accountName ? accountName : null };
}
async function payNames() { return new Map((await prisma.ecomPaymentSettings.findMany({ select: { methodKey: true, name: true } })).map((m) => [m.methodKey, m.name])); }
function card(o: Row, names: Map<string, string>): AgentOrderCard {
  const address = o.shippingAddress || o.customer?.address || "";
  const lines = address.split("\n");
  return {
    id: o.id, number: o.orderNumber, status: o.orderStatus, paid: o.paymentStatus === "Paid", paymentName: names.get(o.paymentMethod) ?? o.paymentMethod,
    total: Number(o.totalAmount), customer: recipient(address, o.customerName, o.customer?.phone ?? null).name, phone: recipient(address, o.customerName, o.customer?.phone ?? null).phone,
    area: (lines.length > 2 ? lines[lines.length - 1] : lines[1] ?? lines[0] ?? "").trim(), address,
    itemCount: o.items.reduce((n, i) => n + i.qty, 0), hasPin: o.shippingLat !== null,
    assignedAt: o.assignedAt?.toISOString() ?? null, deliveredAt: o.deliveredAt?.toISOString() ?? null, cancelReason: o.cancelReason,
  };
}

export async function agentToday(agentId: number) {
  const today = istTodayStart();
  const [active, delivered, cancelled, collected, names] = await Promise.all([
    prisma.ecomOrder.findMany({ where: { deliveryAgentId: agentId, orderStatus: { in: ["In Progress", "Out for Delivery"] } }, orderBy: [{ orderStatus: "desc" }, { assignedAt: "asc" }], select: SELECT }),
    prisma.ecomOrder.findMany({ where: { deliveryAgentId: agentId, orderStatus: "Delivered", deliveredAt: { gte: today } }, orderBy: { deliveredAt: "desc" }, select: SELECT }),
    prisma.ecomOrder.findMany({ where: { deliveryAgentId: agentId, orderStatus: "Canceled", events: { some: { type: "status", toValue: "Canceled", createdAt: { gte: today } } } }, orderBy: { id: "desc" }, select: SELECT }),
    prisma.ecomOrderPayment.findMany({ where: { createdAt: { gte: today }, order: { deliveryAgentId: agentId } }, select: { paymentMethod: true, amount: true } }),
    payNames(),
  ]);
  const sum = (m?: string) => collected.filter((p) => (m ? p.paymentMethod === m : p.paymentMethod !== "Cash")).reduce((n, p) => n + Number(p.amount), 0);
  return {
    active: (active as Row[]).map((o) => card(o, names)), delivered: (delivered as Row[]).map((o) => card(o, names)), cancelled: (cancelled as Row[]).map((o) => card(o, names)),
    stats: {
      total: active.length + delivered.length + cancelled.length, delivered: delivered.length, remaining: active.length, cancelled: cancelled.length,
      toCollect: active.filter((o) => o.paymentStatus !== "Paid").reduce((n, o) => n + Number(o.totalAmount), 0), cash: sum("Cash"), online: sum(),
      products: delivered.reduce((n, o) => n + o.items.reduce((m, i) => m + i.qty, 0), 0),
    },
  };
}

/** One order for the agent — only if it's (or was) assigned to them. */
export async function agentOrder(agentId: number, orderId: number) {
  const o = await prisma.ecomOrder.findFirst({
    where: { id: orderId, deliveryAgentId: agentId },
    include: {
      items: true, customer: { select: { phone: true, address: true } },
      events: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, fromValue: true, toValue: true, note: true, actorName: true, createdAt: true } },
    },
  });
  if (!o) return null;
  const [products, pay] = await Promise.all([
    prisma.ecomProduct.findMany({ where: { id: { in: o.items.map((i) => i.productId) } }, select: { id: true, image: true } }),
    prisma.ecomPaymentSettings.findFirst({ where: { methodKey: o.paymentMethod }, select: { name: true } }),
  ]);
  const img = new Map(products.map((p) => [p.id, p.image]));
  const address = o.shippingAddress || o.customer?.address || "";
  const lat = o.shippingLat === null ? null : Number(o.shippingLat), lng = o.shippingLng === null ? null : Number(o.shippingLng);
  return {
    id: o.id, number: o.orderNumber, status: o.orderStatus, paid: o.paymentStatus === "Paid", paymentName: pay?.name ?? o.paymentMethod,
    total: Number(o.totalAmount), subtotal: Number(o.subtotalAmount), discount: Number(o.discountAmount), gst: Number(o.gstAmount),
    ...(() => { const r = recipient(address, o.customerName, o.customer?.phone ?? null); return { customer: r.name, phone: r.phone, orderedBy: r.orderedBy }; })(),
    address, lat, lng,
    placedAt: o.createdAt.toISOString(), assignedAt: o.assignedAt?.toISOString() ?? null, deliveredAt: o.deliveredAt?.toISOString() ?? null, cancelReason: o.cancelReason,
    items: o.items.map((i) => ({ id: i.id, name: i.productName, qty: i.qty, price: Number(i.price), image: img.get(i.productId) ?? null })),
    events: o.events.map((e) => ({ id: e.id, type: e.type, from: e.fromValue, to: e.toValue, note: e.note, actor: e.actorName, at: e.createdAt.toISOString() })),
  };
}
export type AgentOrder = NonNullable<Awaited<ReturnType<typeof agentOrder>>>;

/** Delivery history between two dates (inclusive), with totals. */
export async function agentHistory(agentId: number, from: Date, to: Date) {
  const range = { gte: from, lte: to };
  const [delivered, cancelled, payments, names] = await Promise.all([
    prisma.ecomOrder.findMany({ where: { deliveryAgentId: agentId, orderStatus: "Delivered", deliveredAt: range }, orderBy: { deliveredAt: "desc" }, select: SELECT }),
    prisma.ecomOrder.findMany({ where: { deliveryAgentId: agentId, orderStatus: "Canceled", events: { some: { type: "status", toValue: "Canceled", createdAt: range } } }, orderBy: { id: "desc" }, select: { ...SELECT, events: { where: { type: "status", toValue: "Canceled" }, select: { createdAt: true }, take: 1 } } }),
    prisma.ecomOrderPayment.findMany({ where: { createdAt: range, order: { deliveryAgentId: agentId } }, select: { paymentMethod: true, amount: true } }),
    payNames(),
  ]);
  const d = (delivered as Row[]).map((o) => card(o, names));
  const c = (cancelled as (Row & { events: { createdAt: Date }[] })[]).map((o) => ({ ...card(o, names), deliveredAt: o.events[0]?.createdAt.toISOString() ?? null }));
  const all = [...d, ...c].sort((a, b) => (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""));
  return {
    orders: all,
    totals: {
      delivered: d.length, cancelled: c.length, products: d.reduce((n, o) => n + o.itemCount, 0),
      value: d.reduce((n, o) => n + o.total, 0),
      cash: payments.filter((p) => p.paymentMethod === "Cash").reduce((n, p) => n + Number(p.amount), 0),
      online: payments.filter((p) => p.paymentMethod !== "Cash").reduce((n, p) => n + Number(p.amount), 0),
      addresses: new Set(d.map((o) => o.address.split("\n").slice(1).join(" ").toLowerCase().replace(/\s+/g, " "))).size,
    },
  };
}

/** Every /agent page checks this itself (layouts and pages render in parallel in Next.js). */
export async function requireAgent() {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login?next=/agent");
  if (!session.permissions.delivery?.deliver) redirect("/admin/dashboard");
  return session;
}
