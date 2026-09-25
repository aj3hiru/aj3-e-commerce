import { prisma } from "@/lib/db";
import { sanitizeCampaignHome, type CampaignHome } from "@/types/campaign-home";
import { campaignState, type CampaignDef } from "@/lib/campaign-core";
import { priceRows, toCampaignDef } from "@/lib/campaign-pricing";

/**
 * Data for /admin/ecommerce/campaign-offer.
 *
 * "Campaign sales" are counted the same way as Sales History: every in-store
 * (POS) bill plus every online order that has been Delivered. Day boundaries
 * are India time (IST, UTC+05:30) whatever time zone the server runs in.
 */

/* ───────────────────────── India-time dates ───────────────────────── */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function istYmd(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
const istStart = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);
const istEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999+05:30`);
const addDays = (ymd: string, n: number) => istYmd(new Date(istStart(ymd).getTime() + n * DAY_MS));
const isYmd = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const MAX_SPAN_DAYS = 366;

export interface RangeFilters {
  from: string; // YYYY-MM-DD (IST)
  to: string;
}

/** From the URL; defaults to "this month so far", like Sales History. */
export function parseRange(sp: { from?: string; to?: string }): RangeFilters {
  const today = istYmd(new Date());
  let from = isYmd(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  let to = isYmd(sp.to) ? sp.to : today;
  if (to < from) [from, to] = [to, from];
  const days = Math.round((istStart(to).getTime() - istStart(from).getTime()) / DAY_MS);
  if (days > MAX_SPAN_DAYS) from = addDays(to, -MAX_SPAN_DAYS);
  return { from, to };
}

/* ───────────────────────── shapes sent to the page ───────────────────────── */

export interface CampaignTargetData {
  type: "category" | "brand" | "product";
  id: number;
  fixedPrice: number | null;
}

export interface CampaignStats {
  orders: number;
  units: number;
  revenue: number;
  discount: number;
}

export interface CampaignRowData {
  id: number;
  name: string;
  scope: "all" | "category" | "brand" | "product";
  discountType: "percent" | "amount" | "fixed";
  discountValue: number | null;
  startsAt: string | null; // ISO instants
  endsAt: string | null;
  isPaused: boolean;
  createdAt: string;
  /** "Show on homepage" banner settings. */
  home: CampaignHome;
  targets: CampaignTargetData[];
  /** All-time totals of completed sales made under this campaign. */
  stats: CampaignStats;
}

export interface PickerProduct {
  id: number;
  name: string;
  image: string | null;
  price: number;
  salePrice: number | null;
  status: string;
  categoryId: number | null;
  brandId: number | null;
}

export interface OfferRow {
  productId: number;
  campaignId: number;
  campaignName: string;
  unitPrice: number;
  beforePrice: number;
}

export interface ChartPoint {
  key: string;
  label: string;
  revenue: number;
  units: number;
  discount: number;
  orders: number;
}

export interface Campaigns2Data {
  /** False until the three campaign tables exist in the database. */
  ready: boolean;
  campaigns: CampaignRowData[];
  products: PickerProduct[];
  categories: { id: number; name: string }[];
  brands: { id: number; name: string }[];
  /** Products with a live campaign price right now (active products only). */
  offers: OfferRow[];
  range: CampaignStats;
  chart: { granularity: "day" | "week"; points: ChartPoint[] };
  /** Products still flagged in the old Campaign Offer list. */
  legacyCount: number;
}

const EMPTY_STATS: CampaignStats = { orders: 0, units: 0, revenue: 0, discount: 0 };
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ───────────────────────── chart buckets ───────────────────────── */

function buildBuckets(from: string, to: string): { granularity: "day" | "week"; keys: string[]; labelOf: (k: string) => string; keyOf: (ymd: string) => string } {
  const days = Math.round((istStart(to).getTime() - istStart(from).getTime()) / DAY_MS) + 1;
  const mon = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });
  const label = (ymd: string) => `${Number(ymd.slice(8, 10))} ${mon.format(new Date(`${ymd}T12:00:00Z`))}`;
  if (days <= 92) {
    const keys = Array.from({ length: days }, (_, i) => addDays(from, i));
    return { granularity: "day", keys, labelOf: label, keyOf: (y) => y };
  }
  // Longer ranges: one point per week (weeks start on Monday).
  const weekStart = (ymd: string) => {
    const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 = Sunday
    return addDays(ymd, -((dow + 6) % 7));
  };
  const keys: string[] = [];
  for (let k = weekStart(from); k <= to; k = addDays(k, 7)) keys.push(k);
  return { granularity: "week", keys, labelOf: label, keyOf: weekStart };
}

/* ───────────────────────── main query ───────────────────────── */

export async function getCampaigns2Data(filters: RangeFilters): Promise<Campaigns2Data> {
  const empty: Campaigns2Data = {
    ready: false, campaigns: [], products: [], categories: [], brands: [], offers: [], range: EMPTY_STATS,
    chart: { granularity: "day", points: [] }, legacyCount: 0,
  };

  // 1) The campaigns. If this fails the tables don't exist yet (setup step not run).
  let campaignRows: {
    id: number; name: string; scope: string; discountType: string; discountValue: unknown; startsAt: Date | null; endsAt: Date | null;
    isPaused: boolean; createdAt: Date; homeDisplay?: unknown; targets: { targetType: string; targetId: number; fixedPrice: unknown }[];
  }[];
  try {
    campaignRows = await prisma.ecomCampaign.findMany({ orderBy: { id: "desc" }, include: { targets: { orderBy: { id: "asc" } } } });
  } catch (e) {
    console.error("campaign tables not available", e);
    return empty;
  }

  // 2) Products, groups, and the old-style flag count — in one go.
  const [productRows, categoryRows, brandRows, legacyCount] = await Promise.all([
    prisma.ecomProduct.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, image: true, price: true, salePrice: true, status: true, categoryId: true, brandId: true },
    }),
    prisma.ecomCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ecomBrand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ecomProduct.count({ where: { isCampaign: true } }),
  ]);
  const products: PickerProduct[] = (productRows as {
    id: number; name: string; image: string | null; price: unknown; salePrice: unknown; status: string; categoryId: number | null; brandId: number | null;
  }[]).map((p) => ({
    id: p.id, name: p.name, image: p.image, price: Number(p.price),
    salePrice: p.salePrice === null || p.salePrice === undefined ? null : Number(p.salePrice),
    status: p.status, categoryId: p.categoryId, brandId: p.brandId,
  }));

  // 3) Sales made under campaigns, kept only for completed sales.
  const sales = (await prisma.ecomCampaignSale
    .findMany({ select: { campaignId: true, orderId: true, qty: true, unitPrice: true, discountPerUnit: true } })
    .catch(() => [])) as { campaignId: number; orderId: number; qty: number; unitPrice: unknown; discountPerUnit: unknown }[];

  const orderDates = new Map<number, Date>();
  const orderIds = [...new Set(sales.map((s) => s.orderId))];
  for (let i = 0; i < orderIds.length; i += 1000) {
    const found = (await prisma.ecomOrder.findMany({
      where: { id: { in: orderIds.slice(i, i + 1000) }, OR: [{ orderType: "offline" }, { orderType: "online", orderStatus: "Delivered" }] },
      select: { id: true, createdAt: true },
    })) as { id: number; createdAt: Date }[];
    for (const o of found) orderDates.set(o.id, o.createdAt);
  }

  const perCampaign = new Map<number, { orders: Set<number>; units: number; revenue: number; discount: number }>();
  const rangeOrders = new Set<number>();
  const rangeTotals = { units: 0, revenue: 0, discount: 0 };
  const startMs = istStart(filters.from).getTime();
  const endMs = istEnd(filters.to).getTime();

  const bucket = buildBuckets(filters.from, filters.to);
  const points = new Map<string, ChartPoint & { orderSet: Set<number> }>(
    bucket.keys.map((k) => [k, { key: k, label: bucket.labelOf(k), revenue: 0, units: 0, discount: 0, orders: 0, orderSet: new Set<number>() }])
  );

  for (const s of sales) {
    const when = orderDates.get(s.orderId);
    if (!when) continue; // not a completed sale (or the order is gone)
    const revenue = Number(s.unitPrice) * s.qty;
    const discount = Number(s.discountPerUnit) * s.qty;

    const c = perCampaign.get(s.campaignId) ?? { orders: new Set<number>(), units: 0, revenue: 0, discount: 0 };
    c.orders.add(s.orderId);
    c.units += s.qty;
    c.revenue += revenue;
    c.discount += discount;
    perCampaign.set(s.campaignId, c);

    const t = when.getTime();
    if (t >= startMs && t <= endMs) {
      rangeOrders.add(s.orderId);
      rangeTotals.units += s.qty;
      rangeTotals.revenue += revenue;
      rangeTotals.discount += discount;
      const pt = points.get(bucket.keyOf(istYmd(when)));
      if (pt) {
        pt.revenue += revenue;
        pt.units += s.qty;
        pt.discount += discount;
        pt.orderSet.add(s.orderId);
      }
    }
  }

  const campaigns: CampaignRowData[] = campaignRows.map((c) => {
    const st = perCampaign.get(c.id);
    return {
      id: c.id,
      name: c.name,
      scope: c.scope as CampaignRowData["scope"],
      discountType: c.discountType as CampaignRowData["discountType"],
      discountValue: c.discountValue === null || c.discountValue === undefined ? null : Number(c.discountValue),
      startsAt: c.startsAt ? c.startsAt.toISOString() : null,
      endsAt: c.endsAt ? c.endsAt.toISOString() : null,
      isPaused: c.isPaused,
      createdAt: c.createdAt.toISOString(),
      home: sanitizeCampaignHome(c.homeDisplay),
      targets: c.targets.map((t) => ({
        type: t.targetType as CampaignTargetData["type"],
        id: t.targetId,
        fixedPrice: t.fixedPrice === null || t.fixedPrice === undefined ? null : Number(t.fixedPrice),
      })),
      stats: st ? { orders: st.orders.size, units: st.units, revenue: r2(st.revenue), discount: r2(st.discount) } : EMPTY_STATS,
    };
  });

  // 4) Products with a live campaign price right now — the same engine the
  //    shop and billing use, so this list is exactly what customers get.
  const now = new Date();
  const defs: CampaignDef[] = campaignRows.map((c) => toCampaignDef(c));
  const hasLive = defs.some((d) => campaignState(d, now) === "live");
  const offers: OfferRow[] = [];
  if (hasLive) {
    const active = products.filter((p) => p.status === "active");
    const priced = priceRows(active, defs, now);
    for (const p of active) {
      const hit = priced.get(p.id);
      if (hit) offers.push({ productId: p.id, campaignId: hit.campaignId, campaignName: hit.campaignName, unitPrice: hit.unitPrice, beforePrice: hit.beforePrice });
    }
  }

  return {
    ready: true,
    campaigns,
    products,
    categories: categoryRows as { id: number; name: string }[],
    brands: brandRows as { id: number; name: string }[],
    offers,
    range: { orders: rangeOrders.size, units: rangeTotals.units, revenue: r2(rangeTotals.revenue), discount: r2(rangeTotals.discount) },
    chart: {
      granularity: bucket.granularity,
      points: [...points.values()].map(({ orderSet, ...p }) => ({ ...p, revenue: r2(p.revenue), discount: r2(p.discount), orders: orderSet.size })),
    },
    legacyCount,
  };
}
