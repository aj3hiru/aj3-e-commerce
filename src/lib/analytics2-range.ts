/**
 * Date-range resolution for /admin/ecommerce/analytics2.
 *
 * A deliberately different preset set from lib/dashboard-range.ts's
 * (today/yesterday/7days/this_month/prev_month) — analytics2 is a new page,
 * not a port, so it gets its own presets matching what a sales-analytics view
 * actually needs: Today, 7 Days, 30 Days, This Year, or a custom range. Each
 * preset also carries the immediately-preceding period of the same length,
 * so every stat card can show a "vs previous period" delta.
 */
export type Analytics2Preset = "today" | "7days" | "30days" | "this_year" | "custom";

export interface Analytics2Range {
  preset: Analytics2Preset;
  label: string;
  dateFrom: string; // YYYY-MM-DD, for <input type="date">
  dateTo: string;
  rangeStart: Date; // inclusive start-of-day
  rangeEnd: Date; // inclusive end-of-day
  prevStart: Date; // the immediately preceding period of the same length
  prevEnd: Date;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function fromParts(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function resolveAnalytics2Range(
  presetParam: string | undefined,
  fromParam: string | undefined,
  toParam: string | undefined
): Analytics2Range {
  const today = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  let preset = (presetParam as Analytics2Preset) || "30days";
  if (!["today", "7days", "30days", "this_year", "custom"].includes(preset)) preset = "30days";

  let rangeStart: Date;
  let rangeEnd: Date = todayEnd;
  let label: string;

  if (preset === "custom" && fromParam && toParam) {
    rangeStart = startOfDay(fromParts(fromParam));
    rangeEnd = endOfDay(fromParts(toParam));
    label = "Custom Range";
  } else if (preset === "today") {
    rangeStart = today;
    label = "Today";
  } else if (preset === "7days") {
    rangeStart = startOfDay(new Date(Date.now() - 6 * 86400000));
    label = "Last 7 Days";
  } else if (preset === "this_year") {
    rangeStart = new Date(today.getFullYear(), 0, 1);
    label = "This Year";
  } else {
    // 30days, and the fallback for a "custom" preset missing its dates
    preset = preset === "custom" ? "custom" : "30days";
    rangeStart = startOfDay(new Date(Date.now() - 29 * 86400000));
    label = preset === "custom" ? "Custom Range" : "Last 30 Days";
  }

  // Previous period: same length, ending the instant before rangeStart.
  const lengthMs = rangeEnd.getTime() - rangeStart.getTime();
  const prevEnd = new Date(rangeStart.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - lengthMs);

  return {
    preset, label, dateFrom: fmt(rangeStart), dateTo: fmt(rangeEnd),
    rangeStart, rangeEnd, prevStart, prevEnd,
  };
}
