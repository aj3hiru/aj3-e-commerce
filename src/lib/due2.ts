import { prisma } from "@/lib/db";

/**
 * Data for /admin/ecommerce/due2.
 *
 * A "due" is one EcomCredit row: money still owed on one order. Balance is
 * always amount − amountPaid, the same sum the old Due page and the dashboard
 * use, so the numbers agree everywhere.
 *
 * Days are India time (IST, UTC+05:30) whatever time zone the server runs in,
 * so "today" means today in the shop.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 86_400_000;

export const istYmd = (d: Date): string => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
export const istStart = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);
export const istEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999+05:30`);
const isYmd = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Balances are money: treat anything under half a paisa as settled. */
const PAISA = 0.004;

export interface Due2Payment {
  receiptNumber: string;
  amount: number;
  paymentMethod: string;
  createdAt: string;
  createdByName: string | null;
}

export interface Due2Row {
  id: number;
  orderId: number;
  orderNumber: string | null;
  orderType: string | null;
  customerId: number | null;
  customerName: string;
  customerPhone: string | null;
  amount: number;
  amountPaid: number;
  balance: number;
  promisedDate: string | null; // YYYY-MM-DD (IST)
  status: string;
  createdAt: string;
  /** Days past the promised date; 0 or less means not overdue. */
  overdueDays: number;
  productIds: number[];
  productNames: string[];
  payments: Due2Payment[];
}

export interface Due2Cards {
  totalDue: number;
  totalDuePeople: number;
  dueCount: number;
  todayNewDue: number;
  todayNewCount: number;
  todayCollected: number;
  todayCollectedCount: number;
  overdueAmount: number;
  overdueCount: number;
  dueTodayAmount: number;
  dueTodayCount: number;
  noDateAmount: number;
  noDateCount: number;
  rangeCollected: number;
  rangeCollectedCount: number;
  totalPaidAllTime: number;
}

export interface Due2Data {
  rows: Due2Row[];
  cards: Due2Cards;
  /** Every product that appears in an unpaid due, for the "by product" filter. */
  products: { id: number; name: string; count: number }[];
  range: { from: string; to: string };
  today: string;
}

export function parseDueRange(sp: { from?: string; to?: string }): { from: string; to: string } {
  const today = istYmd(new Date());
  let from = isYmd(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  let to = isYmd(sp.to) ? sp.to : today;
  if (to < from) [from, to] = [to, from];
  const days = Math.round((istStart(to).getTime() - istStart(from).getTime()) / DAY_MS);
  if (days > 366) from = istYmd(new Date(istStart(to).getTime() - 366 * DAY_MS));
  return { from, to };
}

interface CreditRow {
  id: number;
  orderId: number;
  customerId: number | null;
  customerName: string;
  customerPhone: string | null;
  amount: unknown;
  amountPaid: unknown;
  promisedDate: Date | null;
  status: string;
  createdAt: Date;
  order: { orderNumber: string; orderType: string; items: { productId: number | null; productName: string }[] } | null;
  payments: { receiptNumber: string; amount: unknown; paymentMethod: string; createdBy: number | null; createdAt: Date }[];
}

/**
 * Everything the page needs, in one read. The whole credit list is sent once
 * and all filtering, searching and sorting happens in the browser, so the
 * table reacts instantly — the same approach as the other "2" pages.
 */
export async function getDue2Data(range: { from: string; to: string }): Promise<Due2Data> {
  const credits = (await prisma.ecomCredit.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true, orderId: true, customerId: true, customerName: true, customerPhone: true,
      amount: true, amountPaid: true, promisedDate: true, status: true, createdAt: true,
      order: { select: { orderNumber: true, orderType: true, items: { select: { productId: true, productName: true } } } },
      payments: { orderBy: { createdAt: "asc" }, select: { receiptNumber: true, amount: true, paymentMethod: true, createdBy: true, createdAt: true } },
    },
  })) as CreditRow[];

  // Who recorded each payment (for the history list).
  const staffIds = [...new Set(credits.flatMap((c) => c.payments.map((p) => p.createdBy)).filter((x): x is number => typeof x === "number"))];
  const staff = new Map<number, string>();
  if (staffIds.length) {
    const users = (await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, username: true } }).catch(() => [])) as { id: number; username: string }[];
    for (const u of users) staff.set(u.id, u.username);
  }

  const todayYmd = istYmd(new Date());
  const todayStart = istStart(todayYmd).getTime();
  const rangeStart = istStart(range.from).getTime();
  const rangeEnd = istEnd(range.to).getTime();

  const rows: Due2Row[] = credits.map((c) => {
    const amount = Number(c.amount);
    const amountPaid = Number(c.amountPaid);
    const balance = r2(amount - amountPaid);
    const promised = c.promisedDate ? istYmd(c.promisedDate) : null;
    // Overdue counts whole days past the promised day, in India time.
    const overdueDays = promised && balance > PAISA ? Math.floor((todayStart - istStart(promised).getTime()) / DAY_MS) : 0;
    const items = c.order?.items ?? [];
    return {
      id: c.id,
      orderId: c.orderId,
      orderNumber: c.order?.orderNumber ?? null,
      orderType: c.order?.orderType ?? null,
      customerId: c.customerId,
      customerName: c.customerName,
      customerPhone: c.customerPhone,
      amount,
      amountPaid,
      balance,
      promisedDate: promised,
      status: balance <= PAISA ? "paid" : c.status,
      createdAt: c.createdAt.toISOString(),
      overdueDays: overdueDays > 0 ? overdueDays : 0,
      productIds: [...new Set(items.map((i) => i.productId).filter((x): x is number => typeof x === "number"))],
      productNames: [...new Set(items.map((i) => i.productName))],
      payments: c.payments.map((p) => ({
        receiptNumber: p.receiptNumber,
        amount: Number(p.amount),
        paymentMethod: p.paymentMethod,
        createdAt: p.createdAt.toISOString(),
        createdByName: p.createdBy !== null ? staff.get(p.createdBy) ?? null : null,
      })),
    };
  });

  // ── cards ──
  const unpaid = rows.filter((r) => r.balance > PAISA);
  const people = new Set(unpaid.map((r) => (r.customerId !== null ? `id:${r.customerId}` : `name:${r.customerName.toLowerCase()}|${r.customerPhone ?? ""}`)));

  const sum = (list: Due2Row[], pick: (r: Due2Row) => number) => r2(list.reduce((s, r) => s + pick(r), 0));
  const newToday = rows.filter((r) => new Date(r.createdAt).getTime() >= todayStart);
  const overdue = unpaid.filter((r) => r.overdueDays > 0);
  const dueToday = unpaid.filter((r) => r.promisedDate === todayYmd);
  const noDate = unpaid.filter((r) => r.promisedDate === null);

  let todayCollected = 0, todayCollectedCount = 0, rangeCollected = 0, rangeCollectedCount = 0, totalPaidAllTime = 0;
  for (const r of rows) {
    for (const p of r.payments) {
      const t = new Date(p.createdAt).getTime();
      totalPaidAllTime += p.amount;
      if (t >= todayStart) { todayCollected += p.amount; todayCollectedCount++; }
      if (t >= rangeStart && t <= rangeEnd) { rangeCollected += p.amount; rangeCollectedCount++; }
    }
  }

  // Products that still have money owed against them, most owed first.
  const productMap = new Map<number, { name: string; count: number }>();
  for (const r of unpaid) {
    r.productIds.forEach((id, i) => {
      const cur = productMap.get(id);
      if (cur) cur.count++;
      else productMap.set(id, { name: r.productNames[i] ?? `Product ${id}`, count: 1 });
    });
  }

  return {
    rows,
    cards: {
      totalDue: sum(unpaid, (r) => r.balance),
      totalDuePeople: people.size,
      dueCount: unpaid.length,
      todayNewDue: sum(newToday, (r) => r.amount),
      todayNewCount: newToday.length,
      todayCollected: r2(todayCollected),
      todayCollectedCount,
      overdueAmount: sum(overdue, (r) => r.balance),
      overdueCount: overdue.length,
      dueTodayAmount: sum(dueToday, (r) => r.balance),
      dueTodayCount: dueToday.length,
      noDateAmount: sum(noDate, (r) => r.balance),
      noDateCount: noDate.length,
      rangeCollected: r2(rangeCollected),
      rangeCollectedCount,
      totalPaidAllTime: r2(totalPaidAllTime),
    },
    products: [...productMap.entries()].map(([id, v]) => ({ id, name: v.name, count: v.count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    range,
    today: todayYmd,
  };
}
