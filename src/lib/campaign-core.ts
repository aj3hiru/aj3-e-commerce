import { effectivePrice } from "@/lib/shop-price";

/**
 * Campaign pricing rules — pure functions, no database, safe to import in the
 * browser as well as on the server. The shop, billing and the Campaign Offer 2
 * page all use these same functions, so a price is worked out one way only.
 *
 * The rules (also written on the Campaign Offer 2 page):
 *  - A campaign is LIVE when it isn't paused, its start time has come and its
 *    end time hasn't. Times are exact moments, so the time zone of the server
 *    or the browser never changes when a campaign starts or stops.
 *  - Its price is worked out from the product's regular price: X% off, ₹X
 *    off, or a fixed price set per product.
 *  - A campaign never raises a price and never stacks with a sale price: the
 *    customer pays the LOWEST of the product's sale price and the campaign
 *    price. If several live campaigns match, the cheapest one wins (the older
 *    campaign wins a tie).
 *  - A campaign price of ₹0 or less is ignored for that product.
 */

export type CampaignScope = "all" | "category" | "brand" | "product";
export type CampaignDiscountType = "percent" | "amount" | "fixed";
export type CampaignTargetType = "category" | "brand" | "product";
export type CampaignState = "live" | "scheduled" | "ended" | "paused";

export interface CampaignTargetDef {
  targetType: CampaignTargetType;
  targetId: number;
  fixedPrice: number | null;
}

export interface CampaignDef {
  id: number;
  name: string;
  scope: CampaignScope;
  discountType: CampaignDiscountType;
  discountValue: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isPaused: boolean;
  targets: CampaignTargetDef[];
}

/** What the engine needs to know about a product. `price` is the regular price. */
export interface PricingProduct {
  id: number;
  categoryId: number | null;
  brandId: number | null;
  price: number;
  salePrice: number | null;
}

export interface CampaignPrice {
  campaignId: number;
  campaignName: string;
  /** The price the customer pays per unit under the campaign. */
  unitPrice: number;
  /** What they'd have paid without the campaign (regular or sale price). */
  beforePrice: number;
  /** beforePrice − unitPrice. */
  discountPerUnit: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Where a campaign is in its life. "Ended" beats "Paused" so history reads true. */
export function campaignState(c: { isPaused: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date): CampaignState {
  if (c.endsAt && c.endsAt.getTime() <= now.getTime()) return "ended";
  if (c.isPaused) return "paused";
  if (c.startsAt && c.startsAt.getTime() > now.getTime()) return "scheduled";
  return "live";
}

/** Does this campaign apply to this product (ignoring whether it is live)? */
export function campaignMatches(c: Pick<CampaignDef, "scope" | "targets">, p: Pick<PricingProduct, "id" | "categoryId" | "brandId">): boolean {
  switch (c.scope) {
    case "all":
      return true;
    case "category":
      return p.categoryId !== null && c.targets.some((t) => t.targetType === "category" && t.targetId === p.categoryId);
    case "brand":
      return p.brandId !== null && c.targets.some((t) => t.targetType === "brand" && t.targetId === p.brandId);
    case "product":
      return c.targets.some((t) => t.targetType === "product" && t.targetId === p.id);
    default:
      return false;
  }
}

/** The campaign's price for a product, or null when it can't produce one. */
export function offerPrice(c: Pick<CampaignDef, "scope" | "targets" | "discountType" | "discountValue">, p: PricingProduct): number | null {
  let v: number | null;
  if (c.discountType === "percent") {
    if (c.discountValue === null || !(c.discountValue > 0)) return null;
    v = p.price * (1 - c.discountValue / 100);
  } else if (c.discountType === "amount") {
    if (c.discountValue === null || !(c.discountValue > 0)) return null;
    v = p.price - c.discountValue;
  } else {
    const t = c.targets.find((x) => x.targetType === "product" && x.targetId === p.id);
    v = t && t.fixedPrice !== null ? t.fixedPrice : null;
  }
  if (v === null || !Number.isFinite(v)) return null;
  v = round2(v);
  return v > 0 ? v : null;
}

/**
 * The best live campaign price for one product, or null when no live campaign
 * gives a lower price than the customer would pay anyway.
 */
export function campaignPriceFor(p: PricingProduct, campaigns: readonly CampaignDef[], now: Date): CampaignPrice | null {
  const before = effectivePrice(p.price, p.salePrice);
  let best: CampaignPrice | null = null;
  for (const c of campaigns) {
    if (campaignState(c, now) !== "live") continue;
    if (!campaignMatches(c, p)) continue;
    const cand = offerPrice(c, p);
    if (cand === null || cand >= before) continue;
    if (best === null || cand < best.unitPrice || (cand === best.unitPrice && c.id < best.campaignId)) {
      best = { campaignId: c.id, campaignName: c.name, unitPrice: cand, beforePrice: before, discountPerUnit: round2(before - cand) };
    }
  }
  return best;
}

/** "10% off", "₹50 off" or "Fixed price". */
export function offerLabel(c: Pick<CampaignDef, "discountType" | "discountValue">): string {
  const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  if (c.discountType === "percent") return `${n(c.discountValue ?? 0)}% off`;
  if (c.discountType === "amount") return `₹${n(c.discountValue ?? 0)} off`;
  return "Fixed price";
}
