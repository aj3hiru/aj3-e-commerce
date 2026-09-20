import { prisma } from "@/lib/db";

/**
 * Data for /admin/ecommerce/sales-history2 (and its CSV export).
 *
 * A "sale" is the same as on the original Sales History page: every in-store
 * (offline/POS) order, plus every online order that has been Delivered.
 *
 * All day/week/month boundaries are India time (IST, UTC+05:30, no DST),
 * whatever time zone the server itself runs in — so "Today" always means the
 * shop's today.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD of an instant, in IST. */
export function istYmd(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
/** Start of an IST calendar day (as a real instant). */
function istStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}
/** End of an IST calendar day (inclusive, as a real instant). */
function istEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}
function addDays(ymd: string, n: number): string {
  return istYmd(new Date(istStart(ymd).getTime() + n * DAY_MS));
}
function isYmd(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

export type PaymentFilter = "all" | "paid" | "due" | "due_cleared";
export const ORDER_STATUSES = ["Delivered", "Pending", "In Progress", "Canceled"] as const;

export interface SalesFilters {
  from: string; // YYYY-MM-DD (IST)
  to: string;
  status: "all" | (typeof ORDER_STATUSES)[number];
  payment: PaymentFilter;
  /** "" = all, "guest" = walk-in/guest (no customer record), else a customer id */
  customer: string;
  /** "" = all, else a product id */
  product: string;
  q: string;
}

export type RawSearchParams = Partial<Record<"from" | "to" | "status" | "payment" | "customer" | "product" | "q", string>>;

/** Reads filters from the URL, falling back to "this month so far". */
export function parseSalesFilters(sp: RawSearchParams): SalesFilters {
  const today = istYmd(new Date());
  let from = isYmd(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  let to = isYmd(sp.to) ? sp.to : today;
  if (to < from) [from, to] = [to, from];
  const status = (ORDER_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as SalesFilters["status"])
    : "all";
  const payment = (["paid", "due", "due_cleared"] as const).includes(sp.payment as never)
    ? (sp.payment as PaymentFilter)
    : "all";
  const customer = sp.customer === "guest" || /^\d+$/.test(sp.customer ?? "") ? (sp.customer as string) : "";
  const product = /^\d+$/.test(sp.product ?? "") ? (sp.product as string) : "";
  const q = (sp.q ?? "").trim().slice(0, 100);
  return { from, to, status, payment, customer, product, q };
}

export interface LedgerReceipt {
  receiptNumber: string;
  amount: number;
}

export interface LedgerRow {
  id: number;
  orderNumber: string;
  createdAt: string; // ISO
  customerId: number | null;
  customerName: string;
  orderType: string; // "online" | "offline"
  orderStatus: string;
  itemCount: number;
  itemsSummary: string; // "3 items — 1x pant new, 2x shirt"
  paymentMethod: string;
  total: number;
  paid: number;
  due: number;
  /** "Paid" | "Due" | "Due Cleared" */
  paymentLabel: "Paid" | "Due" | "Due Cleared";
  receipts: LedgerReceipt[];
  /** Credits (due records) on this sale that still have a balance — what the
   *  "Due ₹…" payment form pays into, oldest first. */
  dueCredits: { id: number; balance: number }[];
}

// Written as plain objects (no Prisma.* type names) so this file type-checks
// both here and against the full generated client on the server.
const saleWhere = {
  OR: [{ orderType: "offline" }, { orderType: "online", orderStatus: "Delivered" }],
};

/** The order shape toRow reads (Decimal columns are converted with Number()). */
interface OrderIn {
  id: number;
  orderNumber: string;
  createdAt: Date;
  customerId: number | null;
  customerName: string;
  isGuest: boolean;
  orderType: string;
  orderStatus: string;
  paymentMethod: string;
  totalAmount: unknown;
  items: { qty: number; productName: string }[];
  credits: {
    id: number;
    amount: unknown;
    amountPaid: unknown;
    status: string;
    payments: { receiptNumber: string; amount: unknown }[];
  }[];
}

function toRow(o: OrderIn): LedgerRow {
  const total = Number(o.totalAmount);
  // Outstanding due comes from the credit records, which are updated as due
  // payments are collected. With no credit, an order is either fully paid at
  // the counter or a delivered online order (payment collected on delivery).
  const outstanding = o.credits.reduce(
    (s, c) => s + (c.status === "paid" ? 0 : Math.max(0, Number(c.amount) - Number(c.amountPaid))),
    0
  );
  const due = Math.round(outstanding * 100) / 100;
  const hadCredit = o.credits.length > 0;
  const paid = Math.max(0, Math.round((total - due) * 100) / 100);
  const paymentLabel: LedgerRow["paymentLabel"] = due > 0.004 ? "Due" : hadCredit ? "Due Cleared" : "Paid";

  const itemCount = o.items.length;
  const list = o.items.map((it) => `${it.qty}x ${it.productName}`).join(", ");
  const itemsSummary = itemCount === 0 ? "—" : `${itemCount} item${itemCount === 1 ? "" : "s"} — ${list}`;

  const receiptMap = new Map<string, number>();
  for (const c of o.credits) {
    for (const p of c.payments) {
      receiptMap.set(p.receiptNumber, (receiptMap.get(p.receiptNumber) ?? 0) + Number(p.amount));
    }
  }

  return {
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt.toISOString(),
    customerId: o.customerId,
    customerName: o.customerName || (o.isGuest ? "Guest" : "Walk-in Customer"),
    orderType: o.orderType,
    orderStatus: o.orderStatus,
    itemCount,
    itemsSummary,
    paymentMethod: o.paymentMethod,
    total,
    paid,
    due,
    paymentLabel,
    receipts: [...receiptMap.entries()].map(([receiptNumber, amount]) => ({ receiptNumber, amount })),
    dueCredits: o.credits
      .filter((c) => c.status !== "paid")
      .map((c) => ({ id: c.id, balance: Math.round(Math.max(0, Number(c.amount) - Number(c.amountPaid)) * 100) / 100 }))
      .filter((c) => c.balance > 0.004),
  };
}

/** Ledger rows for the given filters, newest first. */
export async function getLedgerRows(f: SalesFilters): Promise<LedgerRow[]> {
  const orders = await prisma.ecomOrder.findMany({
    where: {
      AND: [
        { createdAt: { gte: istStart(f.from), lte: istEnd(f.to) } },
        f.status === "all" ? saleWhere : { orderStatus: f.status },
        ...(f.customer === "guest" ? [{ customerId: null }] : f.customer ? [{ customerId: Number(f.customer) }] : []),
        ...(f.product ? [{ items: { some: { productId: Number(f.product) } } }] : []),
        ...(f.q
          ? [
              {
                OR: [
                  { orderNumber: { contains: f.q } },
                  { customerName: { contains: f.q } },
                  { items: { some: { productName: { contains: f.q } } } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      items: { select: { qty: true, productName: true } },
      credits: {
        orderBy: { id: "asc" },
        select: { id: true, amount: true, amountPaid: true, status: true, payments: { select: { receiptNumber: true, amount: true } } },
      },
    },
  });

  const rows: LedgerRow[] = orders.map(toRow);
  if (f.payment === "paid") return rows.filter((r) => r.paymentLabel === "Paid");
  if (f.payment === "due") return rows.filter((r) => r.paymentLabel === "Due");
  if (f.payment === "due_cleared") return rows.filter((r) => r.paymentLabel === "Due Cleared");
  return rows;
}

/** Sum of sale totals in [fromYmd, toYmd] (IST, inclusive). */
async function salesTotal(fromYmd: string, toYmd: string): Promise<number> {
  const agg = await prisma.ecomOrder.aggregate({
    where: { AND: [saleWhere, { createdAt: { gte: istStart(fromYmd), lte: istEnd(toYmd) } }] },
    _sum: { totalAmount: true },
  });
  return Number(agg._sum.totalAmount ?? 0);
}

/** % change, or null when there is nothing to compare against. */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface Metric {
  value: number;
  /** % vs the comparison period, null = no comparison available */
  change: number | null;
  compareLabel: string;
}

export interface SalesMetrics {
  rangeTotal: Metric;
  today: Metric;
  yesterday: Metric;
  week: Metric;
  month: Metric;
  dueCollectedToday: number;
  dueOutstanding: number;
}

export interface ChartSeries {
  labels: string[]; // "Sep 1–7" …
  thisMonth: (number | null)[]; // null = bucket hasn't started yet
  prevMonth: number[];
  thisMonthName: string;
  prevMonthName: string;
}

/** Headline figures for the Key Metrics card. Independent of the ledger
 *  filters except the first one, which follows the selected date range. */
export async function getSalesMetrics(f: SalesFilters): Promise<SalesMetrics> {
  const today = istYmd(new Date());
  const yesterday = addDays(today, -1);
  const dayBefore = addDays(today, -2);

  // Week = Monday..today (IST); compared with the same weekdays last week.
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const weekStart = addDays(today, -dow);
  const lastWeekStart = addDays(weekStart, -7);
  const lastWeekSameDay = addDays(today, -7);

  // Month-to-date vs the same days of last month (capped at its length).
  const [y, m, d] = today.split("-").map(Number);
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthDate = new Date(Date.UTC(y, m - 2, 1));
  const prevMonthYm = prevMonthDate.toISOString().slice(0, 7);
  const prevMonthLen = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const prevMonthStart = `${prevMonthYm}-01`;
  const prevMonthSameDay = `${prevMonthYm}-${String(Math.min(d, prevMonthLen)).padStart(2, "0")}`;

  // Selected range vs the equally long period just before it.
  const rangeDays = Math.round((istStart(f.to).getTime() - istStart(f.from).getTime()) / DAY_MS) + 1;
  const prevRangeTo = addDays(f.from, -1);
  const prevRangeFrom = addDays(f.from, -rangeDays);

  const [
    rangeCur, rangePrev, todayV, yesterdayV, dayBeforeV, weekV, lastWeekV, monthV, prevMonthV,
    collectedAgg, outstandingCredits,
  ] = await Promise.all([
    salesTotal(f.from, f.to),
    salesTotal(prevRangeFrom, prevRangeTo),
    salesTotal(today, today),
    salesTotal(yesterday, yesterday),
    salesTotal(dayBefore, dayBefore),
    salesTotal(weekStart, today),
    salesTotal(lastWeekStart, lastWeekSameDay),
    salesTotal(monthStart, today),
    salesTotal(prevMonthStart, prevMonthSameDay),
    prisma.ecomCreditPayment.aggregate({
      where: { createdAt: { gte: istStart(today), lte: istEnd(today) } },
      _sum: { amount: true },
    }),
    prisma.ecomCredit.findMany({
      where: { status: { not: "paid" } },
      select: { amount: true, amountPaid: true },
    }),
  ]);

  const dueOutstanding = outstandingCredits.reduce(
    (s: number, c: { amount: unknown; amountPaid: unknown }) => s + Math.max(0, Number(c.amount) - Number(c.amountPaid)),
    0
  );

  return {
    rangeTotal: { value: rangeCur, change: pctChange(rangeCur, rangePrev), compareLabel: "vs. previous period" },
    today: { value: todayV, change: pctChange(todayV, yesterdayV), compareLabel: "vs. yesterday" },
    yesterday: { value: yesterdayV, change: pctChange(yesterdayV, dayBeforeV), compareLabel: "vs. day before" },
    week: { value: weekV, change: pctChange(weekV, lastWeekV), compareLabel: "vs. last week" },
    month: { value: monthV, change: pctChange(monthV, prevMonthV), compareLabel: "vs. last month" },
    dueCollectedToday: Number(collectedAgg._sum.amount ?? 0),
    dueOutstanding: Math.round(dueOutstanding * 100) / 100,
  };
}

/** This month vs previous month, bucketed by day-of-month (1–7, 8–14, 15–21, 22–28, 29–end). */
export async function getSalesChart(): Promise<ChartSeries> {
  const today = istYmd(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const thisStart = `${today.slice(0, 8)}01`;
  const thisLen = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prevYm = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const prevLen = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const prevStart = `${prevYm}-01`;

  const orders = await prisma.ecomOrder.findMany({
    where: { AND: [saleWhere, { createdAt: { gte: istStart(prevStart), lte: istEnd(today) } }] },
    select: { createdAt: true, totalAmount: true },
  });

  const bucketOf = (day: number) => Math.min(4, Math.floor((day - 1) / 7));
  const thisM = [0, 0, 0, 0, 0];
  const prevM = [0, 0, 0, 0, 0];
  for (const o of orders) {
    const ymd = istYmd(o.createdAt);
    const day = Number(ymd.slice(8, 10));
    if (ymd.startsWith(today.slice(0, 7))) thisM[bucketOf(day)] += Number(o.totalAmount);
    else if (ymd.startsWith(prevYm)) prevM[bucketOf(day)] += Number(o.totalAmount);
  }

  const monthName = new Date(`${thisStart}T12:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const prevName = new Date(`${prevStart}T12:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const thisName = new Date(`${thisStart}T12:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const labels = [0, 1, 2, 3, 4].map((b) => {
    const s = b * 7 + 1;
    const e = b === 4 ? thisLen : s + 6;
    return `${monthName} ${s}–${e}`;
  });
  const currentBucket = bucketOf(d);
  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    labels,
    thisMonth: thisM.map((v, i) => (i <= currentBucket ? round(v) : null)),
    prevMonth: prevM.map(round),
    thisMonthName: thisName,
    prevMonthName: prevName,
  };
}

/** Options for the Customer and Items/Product filters. */
export interface FilterOptions {
  customers: { id: number; name: string; phone: string | null }[];
  products: { id: number; name: string }[];
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const [customers, products] = await Promise.all([
    prisma.ecomCustomer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    prisma.ecomProduct.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { customers, products };
}
