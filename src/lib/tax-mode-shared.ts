/**
 * Business Settings → GST / Tax: are product prices typed WITH GST inside
 * them (MRP-style, the customer pays the shelf price) or WITHOUT (GST is
 * added on top at billing)? Browser-safe — no server imports.
 */
export interface TaxMode { pricesIncludeTax: boolean }
export const DEFAULT_TAX_MODE: TaxMode = { pricesIncludeTax: false };

export function sanitizeTaxMode(v: unknown): TaxMode {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { pricesIncludeTax: o.pricesIncludeTax === true };
}

/** GST inside / on top of `amount` (a line total after its share of any discount). */
export function lineTax(amount: number, rate: number, inclusive: boolean): number {
  if (!(rate > 0) || !(amount > 0)) return 0;
  return inclusive ? amount - amount / (1 + rate / 100) : amount * (rate / 100);
}

/** What the customer pays for the items: GST is added only when prices exclude it. */
export function itemsTotal(afterDiscount: number, gst: number, inclusive: boolean): number {
  return inclusive ? afterDiscount : afterDiscount + gst;
}

/** Taxable value of a line (price without GST). */
export function taxableOf(amount: number, rate: number, inclusive: boolean): number {
  return inclusive ? amount - lineTax(amount, rate, true) : amount;
}
