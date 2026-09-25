import { prisma } from "@/lib/db";
import { buildGrowth, type GrowthSeries } from "@/lib/customers2-growth";

/**
 * Data for /admin/ecommerce/customers.
 *
 * Every customer comes with what the shop actually knows about them: how many
 * orders, how much they've spent, what they still owe, and when they last
 * bought something. Days are India time (IST), so "today" means today in the
 * shop whatever time zone the server runs in.
 *
 * Spend and order counts follow the same rule as Sales History: in-store (POS)
 * bills always count, online orders once they are Delivered.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 86_400_000;

export const istYmd = (d: Date): string => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const istStart = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);
const istEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999+05:30`);
const isYmd = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const PAISA = 0.004;

export interface Customer2Row {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  customerType: string; // "online" | "offline"
  address: string | null;
  status: string;
  createdAt: string;
  orders: number;
  spent: number;
  dueBalance: number;
  lastOrderAt: string | null;
  /** True when this customer bought something inside the chosen date range. */
  activeInRange: boolean;
  avatar: string | null;
  hasPassword: boolean;
  /** Saved delivery addresses. */
  addresses: number;
}

export interface Customer2Cards {
  total: number;
  online: number;
  offline: number;
  active: number;
  inactive: number;
  newInRange: number;
  withDues: number;
  duesAmount: number;
  buyersInRange: number;
  spentInRange: number;
}

export interface Customers2Data {
  rows: Customer2Row[];
  cards: Customer2Cards;
  /** Who joined when, for the Customer Growth graph. */
  growth: GrowthSeries;
  range: { from: string; to: string };
  today: string;
}

export function parseCustomerRange(sp: { from?: string; to?: string }): { from: string; to: string } {
  const today = istYmd(new Date());
  let from = isYmd(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  let to = isYmd(sp.to) ? sp.to : today;
  if (to < from) [from, to] = [to, from];
  const days = Math.round((istStart(to).getTime() - istStart(from).getTime()) / DAY_MS);
  if (days > 366) from = istYmd(new Date(istStart(to).getTime() - 366 * DAY_MS));
  return { from, to };
}

export async function getCustomers2Data(range: { from: string; to: string }): Promise<Customers2Data> {
  const [customers, orders, credits] = await Promise.all([
    prisma.ecomCustomer.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, phone: true, customerType: true, address: true, status: true, createdAt: true, avatar: true, password: true, _count: { select: { addresses: true } } },
    }),
    // Completed sales only, so "spent" matches Sales History.
    prisma.ecomOrder.findMany({
      where: { customerId: { not: null }, OR: [{ orderType: "offline" }, { orderType: "online", orderStatus: "Delivered" }] },
      select: { customerId: true, totalAmount: true, createdAt: true },
    }),
    prisma.ecomCredit.findMany({ select: { customerId: true, amount: true, amountPaid: true } }),
  ]);

  const rangeStart = istStart(range.from).getTime();
  const rangeEnd = istEnd(range.to).getTime();

  const agg = new Map<number, { orders: number; spent: number; last: Date | null; inRange: boolean; spentInRange: number }>();
  for (const o of orders as { customerId: number | null; totalAmount: unknown; createdAt: Date }[]) {
    if (o.customerId === null) continue;
    const cur = agg.get(o.customerId) ?? { orders: 0, spent: 0, last: null, inRange: false, spentInRange: 0 };
    const amount = Number(o.totalAmount);
    cur.orders++;
    cur.spent += amount;
    if (!cur.last || o.createdAt > cur.last) cur.last = o.createdAt;
    const t = o.createdAt.getTime();
    if (t >= rangeStart && t <= rangeEnd) {
      cur.inRange = true;
      cur.spentInRange += amount;
    }
    agg.set(o.customerId, cur);
  }

  const dueByCustomer = new Map<number, number>();
  for (const c of credits as { customerId: number | null; amount: unknown; amountPaid: unknown }[]) {
    if (c.customerId === null) continue;
    const balance = Number(c.amount) - Number(c.amountPaid);
    if (balance > PAISA) dueByCustomer.set(c.customerId, (dueByCustomer.get(c.customerId) ?? 0) + balance);
  }

  const rows: Customer2Row[] = (customers as {
    id: number; name: string; email: string | null; phone: string | null; customerType: string; address: string | null; status: string; createdAt: Date;
    avatar: string | null; password: string | null; _count: { addresses: number };
  }[]).map((c) => {
    const a = agg.get(c.id);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      customerType: c.customerType,
      address: c.address,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      orders: a?.orders ?? 0,
      spent: r2(a?.spent ?? 0),
      dueBalance: r2(dueByCustomer.get(c.id) ?? 0),
      lastOrderAt: a?.last ? a.last.toISOString() : null,
      activeInRange: a?.inRange ?? false,
      avatar: c.avatar ?? null,
      hasPassword: !!c.password,
      addresses: c._count.addresses,
    };
  });

  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= rangeStart && t <= rangeEnd;
  };
  const withDues = rows.filter((r) => r.dueBalance > PAISA);
  const buyers = rows.filter((r) => r.activeInRange);

  return {
    rows,
    cards: {
      total: rows.length,
      online: rows.filter((r) => r.customerType === "online").length,
      offline: rows.filter((r) => r.customerType === "offline").length,
      active: rows.filter((r) => r.status === "active").length,
      inactive: rows.filter((r) => r.status !== "active").length,
      newInRange: rows.filter((r) => inRange(r.createdAt)).length,
      withDues: withDues.length,
      duesAmount: r2(withDues.reduce((s, r) => s + r.dueBalance, 0)),
      buyersInRange: buyers.length,
      spentInRange: r2([...agg.values()].reduce((s, a) => s + a.spentInRange, 0)),
    },
    growth: buildGrowth(rows.map((r) => new Date(r.createdAt).getTime()), range),
    range,
    today: istYmd(new Date()),
  };
}
