/**
 * PHP `number_format()` equivalents.
 *
 * Two traps this exists to avoid, both of which produced wrong output before:
 *
 * 1. `toFixed(2)` gives NO thousands separator at all — `1234567.89` where the
 *    PHP printed `1,234,567.89`.
 * 2. `toLocaleString("en-IN")` groups in the Indian lakh/crore style —
 *    `12,34,567.89` and `1,00,000`. PHP's `number_format()` with its default
 *    "," separator groups in threes regardless of locale, so the original site
 *    shows `1,234,567.89` and `100,000`. Matching the PHP means en-US
 *    grouping, even though this is an Indian store; changing that would be a
 *    visible change to every figure in the admin, not a fix.
 */

/** `number_format($n)` — no decimals, comma-grouped in threes. */
export function formatInt(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** `number_format($n, 2)` — exactly two decimals, comma-grouped in threes. */
export function formatDecimal(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** `'₹' . number_format($n, 2)` */
export function formatMoney(value: number): string {
  return `₹${formatDecimal(value)}`;
}

/** `'₹' . number_format($n, 0)` — used for the storefront cart total. */
export function formatMoneyInt(value: number): string {
  return `₹${formatInt(value)}`;
}
