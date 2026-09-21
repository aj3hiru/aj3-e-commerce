import { prisma } from "@/lib/db";
import { ORDER_STATUSES } from "@/lib/order-statuses";

/**
 * Data for /admin/ecommerce/orders2 — the redesigned All Orders page.
 *
 * The five entries in the sidebar (All / Pending / Progress / Delivered /
 * Canceled) are all this one page with a different ?type=, exactly as the old
 * page works, so every link keeps its meaning and its counts.
 *
 * Only storefront (online) orders appear here; in-store POS bills live in
 * Sales History, same as before.
 *
 * Days are India time (IST), so "today" means today in the shop.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 86_400_000;

export const istYmd = (d: Date): string => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const istStart = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);
const istEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999+05:30`);
const isYmd = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const PAISA = 0.004;

/** How many orders one view loads. Older ones are reached with the date range. */
export const ORDERS_PAGE_SIZE = 500;

export interface Order2Item {
  productId: number | null;
  productName: string;
  qty: number;
  price: number;
}

export interface Order2Row {
  id: number;
  orderNumber: string;
  customerId: number | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  isGuest: boolean;
  shippingAddress: string | null;
  total: number;
  paid: number;
  dueBalance: number;
  paymentStatus: string;
  paymentMethod: string;
  orderStatus: string;
  createdAt: string;
  itemCount: number;
  items: Order2Item[];
}

export interface Orders2Cards {
  total: number;
  totalValue: number;
  today: number;
  todayValue: number;
  unpaid: number;
  unpaidValue: number;
  byStatus: Record<string, { count: number; value: number }>;
}

export interface Orders2Data {
  rows: Order2Row[];
  truncated: boolean;
  cards: Orders2Cards;
  /** Counts for every status across the whole range, for the tabs. */
  statusCounts: { status: string; count: number }[];
  /** All statuses, so the tabs and dropdowns can never drift from the API. */
  statuses: readonly string[];
  products: { id: number; name: string; count: number }[];
  type: string; // "" = all
  range: { from: string; to: string };
  today: string;
}

export function parseOrderRange(sp: { from?: string; to?: string }): { from: string; to: string } {
  const today = istYmd(new Date());
  // Orders are looked at over a longer stretch than a day, so the default is
  // this month — the same as Sales History 2.
  let from = isYmd(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  let to = isYmd(sp.to) ? sp.to : today;
  if (to < from) [from, to] = [to, from];
  const days = Math.round((istStart(to).getTime() - istStart(from).getTime()) / DAY_MS);
  if (days > 366) from = istYmd(new Date(istStart(to).getTime() - 366 * DAY_MS));
  return { from, to };
}

export function parseOrderType(value: string | undefined): string {
  return value && (ORDER_STATUSES as readonly string[]).includes(value) ? value : "";
}

export async function getOrders2Data(type: string, range: { from: string; to: string }): Promise<Orders2Data> {
  const rangeStart = istStart(range.from);
  const rangeEnd = istEnd(range.to);
  const inRange = { gte: rangeStart, lte: rangeEnd };
  const base = { orderType: "online", createdAt: inRange } as const;
  const where = type ? { ...base, orderStatus: type } : base;

  const [orderRows, matching, statusCounts, credits] = await Promise.all([
    prisma.ecomOrder.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ORDERS_PAGE_SIZE,
      select: {
        id: true, orderNumber: true, customerId: true, customerName: true, customerEmail: true, isGuest: true,
        shippingAddress: true, totalAmount: true, paidAmount: true, paymentStatus: true, paymentMethod: true,
        orderStatus: true, createdAt: true,
        customer: { select: { phone: true } },
        items: { select: { productId: true, productName: true, qty: true, price: true } },
      },
    }),
    prisma.ecomOrder.count({ where }),
    Promise.all(
      ORDER_STATUSES.map(async (st) => ({
        status: st as string,
        count: await prisma.ecomOrder.count({ where: { ...base, orderStatus: st } }),
      }))
    ),
    // What is still owed on these orders, so an unpaid order shows its balance.
    prisma.ecomCredit.findMany({ where: { order: { orderType: "online", createdAt: inRange } }, select: { orderId: true, amount: true, amountPaid: true } }),
  ]);

  const dueByOrder = new Map<number, number>();
  for (const c of credits as { orderId: number; amount: unknown; amountPaid: unknown }[]) {
    const balance = Number(c.amount) - Number(c.amountPaid);
    if (balance > PAISA) dueByOrder.set(c.orderId, r2((dueByOrder.get(c.orderId) ?? 0) + balance));
  }

  const rows: Order2Row[] = (orderRows as {
    id: number; orderNumber: string; customerId: number | null; customerName: string; customerEmail: string | null;
    isGuest: boolean; shippingAddress: string | null; totalAmount: unknown; paidAmount: unknown; paymentStatus: string;
    paymentMethod: string; orderStatus: string; createdAt: Date;
    customer: { phone: string | null } | null;
    items: { productId: number | null; productName: string; qty: number; price: unknown }[];
  }[]).map((o) => {
    const total = Number(o.totalAmount);
    const paid = Number(o.paidAmount);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customerId: o.customerId,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      customerPhone: o.customer?.phone ?? null,
      isGuest: o.isGuest,
      shippingAddress: o.shippingAddress,
      total,
      paid,
      dueBalance: dueByOrder.get(o.id) ?? r2(Math.max(0, total - paid)),
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      orderStatus: o.orderStatus,
      createdAt: o.createdAt.toISOString(),
      itemCount: o.items.reduce((s, i) => s + i.qty, 0),
      items: o.items.map((i) => ({ productId: i.productId, productName: i.productName, qty: i.qty, price: Number(i.price) })),
    };
  });

  const todayYmd = istYmd(new Date());
  const dayOf = (iso: string) => istYmd(new Date(iso));
  const sum = (list: Order2Row[]) => r2(list.reduce((s, r) => s + r.total, 0));
  const todayRows = rows.filter((r) => dayOf(r.createdAt) === todayYmd);
  const unpaidRows = rows.filter((r) => r.paymentStatus !== "Paid");

  const byStatus: Record<string, { count: number; value: number }> = {};
  for (const st of ORDER_STATUSES) {
    const list = rows.filter((r) => r.orderStatus === st);
    byStatus[st] = { count: list.length, value: sum(list) };
  }

  // Products in the orders on screen, for the "by product" filter.
  const productMap = new Map<number, { name: string; count: number }>();
  for (const r of rows) {
    for (const i of r.items) {
      if (i.productId === null) continue;
      const cur = productMap.get(i.productId);
      if (cur) cur.count++;
      else productMap.set(i.productId, { name: i.productName, count: 1 });
    }
  }

  return {
    rows,
    truncated: matching > rows.length,
    cards: {
      total: matching,
      totalValue: sum(rows),
      today: todayRows.length,
      todayValue: sum(todayRows),
      unpaid: unpaidRows.length,
      unpaidValue: sum(unpaidRows),
      byStatus,
    },
    statusCounts: statusCounts as { status: string; count: number }[],
    statuses: ORDER_STATUSES,
    products: [...productMap.entries()].map(([id, v]) => ({ id, name: v.name, count: v.count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    type,
    range,
    today: todayYmd,
  };
}
