export type DashboardRange = "today" | "yesterday" | "7days" | "this_month" | "prev_month" | "custom";

export interface RangeResult {
  range: DashboardRange;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;
  rangeLabel: string;
  rangeStart: Date; // inclusive start-of-day
  rangeEnd: Date;   // inclusive end-of-day
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Verified 1:1 against the $range switch statement in admin/dashboard.php. */
export function resolveDashboardRange(
  rangeParam: string | undefined,
  fromParam: string | undefined,
  toParam: string | undefined
): RangeResult {
  const today = new Date();
  const todayStr = fmt(today);
  let range = (rangeParam as DashboardRange) || "today";

  let dateFrom = todayStr;
  let dateTo = todayStr;
  let rangeLabel = "Today";

  switch (range) {
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      dateFrom = dateTo = fmt(y);
      rangeLabel = "Yesterday";
      break;
    }
    case "7days": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      dateFrom = fmt(start);
      dateTo = todayStr;
      rangeLabel = "Last 7 Days";
      break;
    }
    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      dateFrom = fmt(start);
      dateTo = todayStr;
      rangeLabel = "This Month";
      break;
    }
    case "prev_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      dateFrom = fmt(start);
      dateTo = fmt(end);
      rangeLabel = "Previous Month";
      break;
    }
    case "custom": {
      dateFrom = fromParam || todayStr;
      dateTo = toParam || todayStr;
      // Guard against a reversed range, same as the PHP version.
      if (new Date(dateTo) < new Date(dateFrom)) {
        [dateFrom, dateTo] = [dateTo, dateFrom];
      }
      rangeLabel = `${formatLabel(new Date(dateFrom))} – ${formatLabel(new Date(dateTo))}`;
      break;
    }
    case "today":
    default:
      range = "today";
      dateFrom = dateTo = todayStr;
      rangeLabel = "Today";
      break;
  }

  const rangeStart = new Date(`${dateFrom}T00:00:00`);
  const rangeEnd = new Date(`${dateTo}T23:59:59.999`);

  return { range, dateFrom, dateTo, rangeLabel, rangeStart, rangeEnd };
}
