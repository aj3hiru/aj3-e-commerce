/**
 * Formatting for the Campaign Offer 2 page. Every date and time is shown and
 * entered in India time (IST), so the server render and the browser always
 * agree, and a campaign starts and stops at the same moment for everyone
 * whatever their computer's clock setting is.
 */

export const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const moneyShort = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const IST_OFFSET_MS = 330 * 60 * 1000;

const dt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

/** "20 Sep 2026, 6:00 PM" (India time). */
export function fmtDateTime(iso: string): string {
  const p = Object.fromEntries(dt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
}

/** An instant → the value a <input type="datetime-local"> shows in India time: "2026-09-20T18:00". */
export function toIstInput(iso: string | Date): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** What a <input type="datetime-local"> holds (India time) → the exact instant as ISO; null if empty/invalid. */
export function fromIstInput(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "2d 4h", "3h 12m", "12m", "under a minute". */
export function durationText(ms: number): string {
  const min = Math.floor(Math.abs(ms) / 60000);
  if (min < 1) return "under a minute";
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
