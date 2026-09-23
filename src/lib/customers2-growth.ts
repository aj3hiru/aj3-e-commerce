/**
 * Numbers behind the "Customer Growth" graph on /admin/ecommerce/customers:
 * how many customers joined, when, compared with the period just before.
 *
 * Pure (no database, no clock unless passed in), so it can be tested on its
 * own. Every day is India time (IST, UTC+05:30) whatever time zone the server
 * runs in, so a customer who joined at 11:45 pm in the shop lands on that day.
 *
 * How the range is split into points on the graph:
 *   1 day        → 24 hours
 *   2–35 days    → one point per day
 *   36–140 days  → one point per week
 *   more         → one point per 30 days
 * The "previous period" is the same number of days ending the day before the
 * range starts, split the same way, so point 3 of one lines up with point 3 of
 * the other.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type GrowthUnit = "hour" | "day" | "week" | "month";

export interface GrowthBucket {
  /** Short text under the point on the graph. */
  label: string;
  /** Longer text in the hover box. */
  tip: string;
  /** Customers who joined in this slot; null for a slot that hasn't happened yet. */
  current: number | null;
  /** Customers who joined in the matching slot of the previous period. */
  previous: number;
}

export interface GrowthSeries {
  unit: GrowthUnit;
  buckets: GrowthBucket[];
  currentTotal: number;
  previousTotal: number;
  /** % more or fewer than the previous period; null when there was nothing before to compare. */
  change: number | null;
  currentRange: { from: string; to: string };
  previousRange: { from: string; to: string };
}

/** Whole days since 1970-01-01 in India time. */
const dayNumber = (ms: number) => Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
const ymdToDay = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
const dayToYmd = (d: number) => new Date(d * DAY_MS).toISOString().slice(0, 10);
const shortDay = (d: number) => {
  const dt = new Date(d * DAY_MS);
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
};
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

export function buildGrowth(createdAtMs: number[], range: { from: string; to: string }, nowMs: number = Date.now()): GrowthSeries {
  const fromDay = ymdToDay(range.from);
  const toDay = ymdToDay(range.to);
  const n = toDay - fromDay + 1;
  const prevFrom = fromDay - n;
  const prevTo = fromDay - 1;
  const today = dayNumber(nowMs);
  const nowHour = Math.floor((((nowMs + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / HOUR_MS);

  const currentRange = { from: range.from, to: range.to };
  const previousRange = { from: dayToYmd(prevFrom), to: dayToYmd(prevTo) };

  let unit: GrowthUnit;
  let cur: number[];
  let prev: number[];
  let buckets: GrowthBucket[];

  if (n === 1) {
    unit = "hour";
    cur = new Array(24).fill(0);
    prev = new Array(24).fill(0);
    for (const ms of createdAtMs) {
      const d = dayNumber(ms);
      const hour = Math.floor((((ms + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / HOUR_MS);
      if (d === fromDay) cur[hour]++;
      else if (d === prevFrom) prev[hour]++;
    }
    buckets = cur.map((c, h) => ({
      label: hourLabel(h),
      tip: `${hourLabel(h)}, ${shortDay(fromDay)}`,
      // Later hours of today haven't happened yet.
      current: fromDay > today || (fromDay === today && h > nowHour) ? null : c,
      previous: prev[h],
    }));
  } else {
    const chunk = n <= 35 ? 1 : n <= 140 ? 7 : 30;
    unit = chunk === 1 ? "day" : chunk === 7 ? "week" : "month";
    const count = Math.ceil(n / chunk);
    cur = new Array(count).fill(0);
    prev = new Array(count).fill(0);
    for (const ms of createdAtMs) {
      const d = dayNumber(ms);
      if (d >= fromDay && d <= toDay) cur[Math.floor((d - fromDay) / chunk)]++;
      else if (d >= prevFrom && d <= prevTo) prev[Math.floor((d - prevFrom) / chunk)]++;
    }
    buckets = cur.map((c, i) => {
      const start = fromDay + i * chunk;
      const end = Math.min(toDay, start + chunk - 1);
      return {
        label: shortDay(start),
        tip: chunk === 1 ? shortDay(start) : `${shortDay(start)} – ${shortDay(end)}`,
        current: start > today ? null : c,
        previous: prev[i],
      };
    });
  }

  const currentTotal = cur.reduce((s, v) => s + v, 0);
  const previousTotal = prev.reduce((s, v) => s + v, 0);
  return {
    unit,
    buckets,
    currentTotal,
    previousTotal,
    change: previousTotal > 0 ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100) : null,
    currentRange,
    previousRange,
  };
}
