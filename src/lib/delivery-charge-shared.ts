/**
 * Business Settings → Delivery Charge (online orders only; store bills never pay it).
 *   enabled    — charge for delivery at all
 *   charge     — amount added to the order when it is below the free limit
 *   freeAbove  — orders whose items total is at least this are delivered free (null = never free)
 */
export interface DeliverySettings { enabled: boolean; charge: number; freeAbove: number | null; note: string }
export const DEFAULT_DELIVERY: DeliverySettings = { enabled: false, charge: 0, freeAbove: null, note: "" };

const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };

export function sanitizeDelivery(input: unknown): DeliverySettings {
  const r = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const free = r.freeAbove === null || r.freeAbove === undefined || r.freeAbove === "" ? null : money(r.freeAbove);
  return {
    enabled: r.enabled === true,
    charge: Math.min(money(r.charge), 100000),
    freeAbove: free === null ? null : Math.min(free, 10_000_000),
    note: typeof r.note === "string" ? r.note.trim().slice(0, 200) : "",
  };
}

/** Delivery charge for an online order whose items total (before GST) is `itemsTotal`. */
export function deliveryChargeFor(itemsTotal: number, s: DeliverySettings): number {
  if (!s.enabled || s.charge <= 0 || itemsTotal <= 0) return 0;
  if (s.freeAbove !== null && itemsTotal >= s.freeAbove) return 0;
  return s.charge;
}
