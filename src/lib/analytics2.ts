import { prisma } from "./db";
import { getEcommerceAnalytics, type EcommerceAnalyticsData } from "./ecommerce-analytics";
import type { Analytics2Range } from "./analytics2-range";
import { computeDelta, type Delta } from "./dashboard2-delta";
import type { DashboardRange, RangeResult } from "./dashboard-range";

/** Adapts analytics2's own range shape to the RangeResult getEcommerceAnalytics expects —
 *  only rangeStart/rangeEnd are actually read by it, the rest is display metadata it ignores. */
function toRangeResult(start: Date, end: Date): RangeResult {
  return {
    range: "custom" as DashboardRange,
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
    rangeLabel: "",
    rangeStart: start,
    rangeEnd: end,
  };
}

export interface PaymentMethodSlice {
  method: string;
  label: string;
  color: string;
  amount: number;
  pct: number;
}

const METHOD_META: Record<string, { label: string; color: string }> = {
  UPI: { label: "UPI", color: "#7c3aed" },
  Card: { label: "Card", color: "#2563eb" },
  Cash: { label: "Cash", color: "#16a34a" },
  Split: { label: "Split Payment", color: "#f59e0b" },
  Other: { label: "Other", color: "#6b7280" },
};

/**
 * Sales by Payment Method — real data from ecom_orders.payment_method, with
 * "Split" orders broken down by their actual ecom_order_payments rows (each
 * carries its own method + amount) rather than lumped under one bucket, so
 * the total still reconciles to the period's net sales.
 */
async function getPaymentMethodBreakdown(rangeStart: Date, rangeEnd: Date, orderTypeFilter: "all" | "online" | "offline") {
  const typeWhere = orderTypeFilter === "all" ? {} : { orderType: orderTypeFilter };
  const orders = await prisma.ecomOrder.findMany({
    where: { ...typeWhere, createdAt: { gte: rangeStart, lte: rangeEnd } },
    select: { id: true, totalAmount: true, paymentMethod: true, payments: { select: { paymentMethod: true, amount: true } } },
  });

  const totals = new Map<string, number>();
  const add = (method: string, amount: number) => totals.set(method, (totals.get(method) ?? 0) + amount);

  for (const o of orders as { id: number; totalAmount: unknown; paymentMethod: string; payments: { paymentMethod: string; amount: unknown }[] }[]) {
    if (o.paymentMethod === "Split" && o.payments.length > 0) {
      for (const p of o.payments) add(p.paymentMethod || "Other", Number(p.amount));
    } else {
      add(o.paymentMethod || "Other", Number(o.totalAmount));
    }
  }

  const grand = Array.from(totals.values()).reduce((s, v) => s + v, 0);
  const slices: PaymentMethodSlice[] = Array.from(totals.entries())
    .map(([method, amount]) => {
      const meta = METHOD_META[method] ?? { label: method, color: "#94a3b8" };
      return { method, label: meta.label, color: meta.color, amount, pct: grand > 0 ? Math.round((amount / grand) * 1000) / 10 : 0 };
    })
    .sort((a, b) => b.amount - a.amount);

  return { slices, grand };
}

export interface Analytics2Data {
  current: EcommerceAnalyticsData;
  grossSales: number; // subtotal + gst, before discount
  netSales: number; // what was actually charged (= totalAmount sum, same as current.totalRevenue)
  deltas: {
    grossSales: Delta; netSales: Delta; orders: Delta; avgOrderValue: Delta;
  };
  payment: { slices: PaymentMethodSlice[]; grand: number };
  dailySeries: { date: string; revenue: number; orders: number }[];
}

export async function getAnalytics2Data(range: Analytics2Range, orderTypeFilter: "all" | "online" | "offline"): Promise<Analytics2Data> {
  const typeWhere = orderTypeFilter === "all" ? {} : { orderType: orderTypeFilter };

  const grossSelect = { subtotalAmount: true, gstAmount: true } as const;
  const [current, previous, grossRows, prevGrossRows, payment] = await Promise.all([
    getEcommerceAnalytics(toRangeResult(range.rangeStart, range.rangeEnd), orderTypeFilter),
    getEcommerceAnalytics(toRangeResult(range.prevStart, range.prevEnd), orderTypeFilter),
    prisma.ecomOrder.findMany({ where: { ...typeWhere, createdAt: { gte: range.rangeStart, lte: range.rangeEnd } }, select: grossSelect }),
    prisma.ecomOrder.findMany({ where: { ...typeWhere, createdAt: { gte: range.prevStart, lte: range.prevEnd } }, select: grossSelect }),
    getPaymentMethodBreakdown(range.rangeStart, range.rangeEnd, orderTypeFilter),
  ]);

  const sumGross = (rows: { subtotalAmount: unknown; gstAmount: unknown }[]) =>
    rows.reduce((s, o) => s + Number(o.subtotalAmount) + Number(o.gstAmount), 0);
  const grossSales = sumGross(grossRows);
  const netSales = current.totalRevenue;
  const prevGrossSales = sumGross(prevGrossRows);

  const dailySeries = current.dailyRevenue.map((d) => ({ date: d.date, revenue: d.revenue, orders: d.orderCount }));

  return {
    current,
    grossSales,
    netSales,
    deltas: {
      grossSales: computeDelta(grossSales, prevGrossSales),
      netSales: computeDelta(netSales, previous.totalRevenue),
      orders: computeDelta(current.totalOrders, previous.totalOrders),
      avgOrderValue: computeDelta(current.avgOrderValue, previous.avgOrderValue),
    },
    payment,
    dailySeries,
  };
}
