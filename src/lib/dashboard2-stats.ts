import { prisma } from "./db";
import { getDashboardStats, type DashboardStats } from "./dashboard-stats";
import type { RangeResult } from "./dashboard-range";
import { computeDelta, type Delta } from "./dashboard2-delta";

export { computeDelta, type Delta };

/**
 * Data for the `/admin/dashboard2` layout.
 *
 * It reuses `getDashboardStats()` unchanged for the current period, then adds
 * the two things that layout shows and the original dashboard does not:
 *
 *  • a "vs. previous period" delta on each headline card, and
 *  • a Mon-Sun sales series for the Sales Overview chart.
 */

export interface Dashboard2Stats extends DashboardStats {
  deltas: {
    onTotal: Delta;
    onPending: Delta;
    onProgress: Delta;
    onDelivered: Delta;
    onCanceled: Delta;
    onCustomers: Delta;
    offCustomers: Delta;
  };
  /** Seven points, Monday → Sunday of the current week. */
  salesSeries: { label: string; value: number }[];
  /** True when every point is zero — the chart shows its empty state instead. */
  salesSeriesEmpty: boolean;
}

/**
 * The period immediately before the selected one, of the same length.
 *
 * Measured in whole days and anchored to midnight so a "Today" range compares
 * against yesterday rather than "the last 24 hours", which is what the card
 * label ("vs. previous period") promises.
 */
export function previousPeriod(range: RangeResult): { start: Date; end: Date } {
  const start = new Date(`${range.dateFrom}T00:00:00`);
  const end = new Date(`${range.dateTo}T23:59:59.999`);
  const dayMs = 24 * 60 * 60 * 1000;
  // +1 because both ends are inclusive: a single-day range spans one day.
  const lengthDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;

  const prevEnd = new Date(start.getTime() - 1); // 23:59:59.999 the day before
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - lengthDays);

  return { start: prevStart, end: prevEnd };
}

/** Monday-based start of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (out.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  out.setDate(out.getDate() - dow);
  return out;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function getDashboard2Stats(range: RangeResult): Promise<Dashboard2Stats> {
  const prev = previousPeriod(range);

  const weekStart = startOfWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setMilliseconds(weekEnd.getMilliseconds() - 1);

  const prevWindow = { gte: prev.start, lte: prev.end };

  const [
    stats,
    pOnTotal, pOnPending, pOnProgress, pOnDelivered, pOnCanceled, pOnCustomers, pOffCustomers,
    weekOrders,
  ] = await Promise.all([
    getDashboardStats(range),

    // Same filters as the current-period cards, shifted to the previous window.
    prisma.ecomOrder.count({ where: { orderType: "online", createdAt: prevWindow } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "Pending", createdAt: prevWindow } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "In Progress", createdAt: prevWindow } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "Delivered", createdAt: prevWindow } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "Canceled", createdAt: prevWindow } }),
    prisma.ecomCustomer.count({ where: { customerType: "online", createdAt: prevWindow } }),
    prisma.ecomCustomer.count({ where: { customerType: "offline", createdAt: prevWindow } }),

    // The chart is always the CURRENT week regardless of the range filter —
    // its axis is labelled Mon-Sun, so re-scoping it to an arbitrary range
    // would make those labels a lie.
    prisma.ecomOrder.findMany({
      where: { paymentStatus: "Paid", createdAt: { gte: weekStart, lte: weekEnd } },
      select: { totalAmount: true, createdAt: true },
    }),
  ]);

  const buckets = new Array(7).fill(0) as number[];
  for (const o of weekOrders as { totalAmount: unknown; createdAt: Date }[]) {
    const dow = (o.createdAt.getDay() + 6) % 7;
    buckets[dow] += Number(o.totalAmount);
  }

  const salesSeries = WEEKDAYS.map((label, i) => ({ label, value: buckets[i] }));

  return {
    ...stats,
    deltas: {
      onTotal: computeDelta(stats.onTotal, pOnTotal),
      onPending: computeDelta(stats.onPending, pOnPending),
      onProgress: computeDelta(stats.onProgress, pOnProgress),
      onDelivered: computeDelta(stats.onDelivered, pOnDelivered),
      onCanceled: computeDelta(stats.onCanceled, pOnCanceled),
      onCustomers: computeDelta(stats.onCustomers, pOnCustomers),
      offCustomers: computeDelta(stats.offCustomers, pOffCustomers),
    },
    salesSeries,
    salesSeriesEmpty: salesSeries.every((p) => p.value === 0),
  };
}
