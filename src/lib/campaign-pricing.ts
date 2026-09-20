import { prisma } from "@/lib/db";
import {
  campaignPriceFor,
  type CampaignDef,
  type CampaignDiscountType,
  type CampaignPrice,
  type CampaignScope,
  type CampaignTargetType,
} from "@/lib/campaign-core";

/**
 * Server side of campaign pricing: loads the campaigns and hands the shop and
 * billing the price to use. The rules themselves live in campaign-core.ts.
 *
 * SAFE BY DESIGN — a campaign problem can never stop a sale or a page:
 *  - if the campaign tables can't be read (not created yet, database hiccup),
 *    loadLiveCampaigns() returns [] and everything sells at its normal price;
 *  - recordCampaignSales() swallows its own errors.
 */

interface CampaignRow {
  id: number;
  name: string;
  scope: string;
  discountType: string;
  discountValue: unknown;
  startsAt: Date | null;
  endsAt: Date | null;
  isPaused: boolean;
  targets: { targetType: string; targetId: number; fixedPrice: unknown }[];
}

export function toCampaignDef(r: CampaignRow): CampaignDef {
  return {
    id: r.id,
    name: r.name,
    scope: r.scope as CampaignScope,
    discountType: r.discountType as CampaignDiscountType,
    discountValue: r.discountValue === null || r.discountValue === undefined ? null : Number(r.discountValue),
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    isPaused: r.isPaused,
    targets: r.targets.map((t) => ({
      targetType: t.targetType as CampaignTargetType,
      targetId: t.targetId,
      fixedPrice: t.fixedPrice === null || t.fixedPrice === undefined ? null : Number(t.fixedPrice),
    })),
  };
}

// A short-lived copy, so a busy shop doesn't ask the database on every page.
// It holds campaigns that are not paused and have not ended — their start and
// end moments are checked against the clock on every use, so a scheduled
// campaign starts and stops exactly on time without refreshing the copy. It is
// cleared whenever a campaign is saved.
const TTL_MS = 15_000;
const FAILED_TTL_MS = 60_000;
let cache: { at: number; ttl: number; data: CampaignDef[] } | null = null;

export function clearCampaignCache() {
  cache = null;
}

/** Campaigns that are, or will become, live (not paused, not ended). Any failure → []. */
export async function loadLiveCampaigns(opts: { fresh?: boolean } = {}): Promise<CampaignDef[]> {
  const t = Date.now();
  if (!opts.fresh && cache && t - cache.at < cache.ttl) return cache.data;
  try {
    const rows = (await prisma.ecomCampaign.findMany({
      where: { isPaused: false, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
      include: { targets: true },
    })) as CampaignRow[];
    const data = rows.map(toCampaignDef);
    cache = { at: t, ttl: TTL_MS, data };
    return data;
  } catch (e) {
    console.error("campaigns could not be loaded — selling at normal prices", e);
    cache = { at: t, ttl: FAILED_TTL_MS, data: [] };
    return [];
  }
}

/** A product row from the database (Decimal columns are converted with Number()). */
export interface PricedRow {
  id: number;
  categoryId?: number | null;
  brandId?: number | null;
  price: unknown;
  salePrice?: unknown;
}

/** Campaign price details for every product that has one right now, keyed by product id. */
export async function campaignPricingFor(rows: readonly PricedRow[], opts: { fresh?: boolean } = {}): Promise<Map<number, CampaignPrice>> {
  const out = new Map<number, CampaignPrice>();
  if (rows.length === 0) return out;
  const campaigns = await loadLiveCampaigns(opts);
  if (campaigns.length === 0) return out;
  return priceRows(rows, campaigns, new Date());
}

/** Same, when the campaigns are already loaded (e.g. before opening a transaction). */
export function priceRows(rows: readonly PricedRow[], campaigns: readonly CampaignDef[], now: Date): Map<number, CampaignPrice> {
  const out = new Map<number, CampaignPrice>();
  for (const r of rows) {
    const price = Number(r.price);
    const sale = r.salePrice === null || r.salePrice === undefined ? null : Number(r.salePrice);
    const hit = campaignPriceFor(
      { id: r.id, categoryId: r.categoryId ?? null, brandId: r.brandId ?? null, price, salePrice: sale !== null && sale > 0 ? sale : null },
      campaigns,
      now
    );
    if (hit) out.set(r.id, hit);
  }
  return out;
}

/**
 * For pages that show prices: product id → the price to show as the sale price
 * (only for products that have a live campaign). Use as
 *   salePrice: campaignSale.get(p.id) ?? (existing sale price)
 * — the shop already shows the regular price struck through beside the sale price.
 */
export async function campaignSalePrices(rows: readonly PricedRow[]): Promise<Map<number, number>> {
  const m = await campaignPricingFor(rows);
  return new Map([...m].map(([id, c]) => [id, c.unitPrice] as const));
}

export interface CampaignSaleInput {
  campaignId: number;
  orderId: number;
  orderItemId: number;
  productId: number;
  qty: number;
  unitPrice: number;
  discountPerUnit: number;
}

/** Remember which order lines were sold under a campaign. Never throws. */
export async function recordCampaignSales(sales: readonly CampaignSaleInput[]): Promise<void> {
  if (sales.length === 0) return;
  try {
    await prisma.ecomCampaignSale.createMany({ data: sales.map((s) => ({ ...s })), skipDuplicates: true });
  } catch (e) {
    console.error("campaign sales could not be recorded (the sale itself was saved)", e);
  }
}
