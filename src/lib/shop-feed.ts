import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { loadLiveCampaigns, priceRows } from "@/lib/campaign-pricing";
import { LOW_STOCK_LIMIT } from "@/components/admin/products2/filters";
import { FEED_PAGE_SIZE, type FeedFilters, type FeedProduct, type FeedResult, type FeedSort } from "@/lib/shop-feed-shared";

export * from "@/lib/shop-feed-shared";

/**
 * "Products For You" on the storefront home (Meesho-style feed): search,
 * category/brand filters, price/discount/rating/availability filters, sort,
 * and pages of 20. Prices are what the shopper pays right now (sale or live
 * campaign), ratings come from approved reviews.
 */

const CAP = 3000; // price/discount/rating need computed values, so they're applied in memory over at most this many matches

export const FEED_SELECT = {
  id: true, slug: true, name: true, image: true, price: true, salePrice: true, stockQty: true, productType: true,
  badgeTag: true, categoryId: true, brandId: true, createdAt: true,
} as const;
export type FeedRow = { id: number; slug: string; name: string; image: string | null; price: unknown; salePrice: unknown; stockQty: number | null;
  productType: string; badgeTag: string; categoryId: number | null; brandId: number | null; createdAt: Date };

/** Product rows → what a product tile needs: live price/discount, rating, stock, deal countdown. */
export async function enrichProducts(rows: FeedRow[]): Promise<(FeedProduct & { _created: number })[]> {
  const [campaigns, ratingRows] = await Promise.all([
    loadLiveCampaigns().catch(() => []),
    rows.length
      ? prisma.ecomProductReview.groupBy({ by: ["productId"], where: { status: "approved", productId: { in: rows.map((r) => r.id) } }, _avg: { rating: true }, _count: { _all: true } })
      : Promise.resolve([]),
  ]);
  const now = new Date();
  const campaignPrice = priceRows(rows, campaigns, now);
  const endsById = new Map(campaigns.map((c) => [c.id, c.endsAt]));
  const ratings = new Map((ratingRows as { productId: number; _avg: { rating: number | null }; _count: { _all: number } }[])
    .map((r) => [r.productId, { avg: r._avg.rating, count: r._count._all }]));

  return rows.map((r) => {
    const price = Number(r.price);
    const sale = r.salePrice === null || r.salePrice === undefined ? 0 : Number(r.salePrice);
    const camp = campaignPrice.get(r.id);
    const finalPrice = camp ? camp.unitPrice : sale > 0 && sale < price ? sale : price;
    const tracked = r.productType === "physical" && r.stockQty !== null;
    const ends = camp ? endsById.get(camp.campaignId) : null;
    const rt = ratings.get(r.id);
    return {
      id: r.id, slug: r.slug, name: r.name, image: r.image, price, finalPrice,
      // Never "100% off" for something that still costs money (rounding 99.99%).
      discountPct: price > 0 && finalPrice < price ? Math.min(finalPrice > 0 ? 99 : 100, Math.round(((price - finalPrice) / price) * 100)) : 0,
      rating: rt?.avg ? Math.round(rt.avg * 10) / 10 : null, reviews: rt?.count ?? 0,
      stock: !tracked ? "untracked" : r.stockQty! <= 0 ? "out" : r.stockQty! <= LOW_STOCK_LIMIT ? "low" : "in",
      dealEndsAt: ends && ends.getTime() > now.getTime() && ends.getTime() - now.getTime() < 3 * 86_400_000 ? ends.toISOString() : null,
      badge: r.badgeTag,
      _created: r.createdAt.getTime(),
    };
  });
}

/** Strips the internal sort key before sending products to the browser. */
export const publicProducts = (list: (FeedProduct & { _created: number })[]): FeedProduct[] =>
  list.map((p) => { const out: Partial<typeof p> = { ...p }; delete out._created; return out as FeedProduct; });

const FEED_DEPS = ["EcomProduct", "EcomProductReview", "EcomCampaign", "EcomCampaignTarget", "EcomCategory", "EcomBrand", "EcomSubcategory"] as const;

/** Browsing (not searching) results are shared by every shopper, so they're cached until a product / review / campaign changes. */
export function getShopFeed(f: FeedFilters): Promise<FeedResult> {
  if (f.q) return loadShopFeed(f);
  return cached(`feed:${JSON.stringify(f)}`, FEED_DEPS, 30_000, () => loadShopFeed(f));
}

async function loadShopFeed(f: FeedFilters): Promise<FeedResult> {
  const and: Record<string, unknown>[] = [{ status: "active" }];
  if (f.q) and.push({ OR: [{ name: { contains: f.q } }, { sku: { contains: f.q } }, { category: { name: { contains: f.q } } }, { brand: { name: { contains: f.q } } }] });
  if (f.cat.length) and.push({ category: { slug: { in: f.cat }, status: "active" } });
  if (f.sub) and.push({ subcategory: { slug: f.sub } });
  if (f.brand.length) and.push({ brandId: { in: f.brand } });
  if (f.inStock) and.push({ OR: [{ productType: { not: "physical" } }, { stockQty: null }, { stockQty: { gt: 0 } }] });

  const rows = (await prisma.ecomProduct.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CAP,
    select: FEED_SELECT,
  })) as FeedRow[];
  let items = await enrichProducts(rows);

  if (f.min !== null) items = items.filter((p) => p.finalPrice >= f.min!);
  if (f.max !== null) items = items.filter((p) => p.finalPrice <= f.max!);
  if (f.disc !== null) items = items.filter((p) => p.discountPct >= f.disc!);
  if (f.rating !== null) items = items.filter((p) => (p.rating ?? 0) >= f.rating!);

  const inStockFirst = (a: FeedProduct, b: FeedProduct) => Number(a.stock === "out") - Number(b.stock === "out");
  const sorters: Record<FeedSort, (a: FeedProduct & { _created: number }, b: FeedProduct & { _created: number }) => number> = {
    // Relevance: buyable first, then live deals and discounts, then well-rated, then newest.
    relevance: (a, b) => inStockFirst(a, b) || Number(!!b.dealEndsAt) - Number(!!a.dealEndsAt) || b.discountPct - a.discountPct
      || (b.rating ?? 0) - (a.rating ?? 0) || b._created - a._created,
    new: (a, b) => b._created - a._created,
    price_asc: (a, b) => a.finalPrice - b.finalPrice || b._created - a._created,
    price_desc: (a, b) => b.finalPrice - a.finalPrice || b._created - a._created,
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviews - a.reviews || b._created - a._created,
    discount: (a, b) => b.discountPct - a.discountPct || b._created - a._created,
  };
  items.sort(sorters[f.sort]);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / FEED_PAGE_SIZE));
  const page = Math.min(f.page, pageCount);
  const products = publicProducts(items.slice((page - 1) * FEED_PAGE_SIZE, page * FEED_PAGE_SIZE));
  return { products, total, page, pageCount };
}

/** Options for the Category / Brand sheets: only ones that have live products. */
export function getFeedFacets(): Promise<{ categories: { slug: string; name: string; image: string | null; count: number }[]; brands: { id: number; name: string; count: number }[] }> {
  return cached("facets", ["EcomCategory", "EcomBrand", "EcomProduct"], 60_000, loadFeedFacets);
}

async function loadFeedFacets() {
  const [cats, brands, byCat, byBrand] = await Promise.all([
    prisma.ecomCategory.findMany({ where: { status: "active" }, orderBy: [{ serial: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true, image: true } }),
    prisma.ecomBrand.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ecomProduct.groupBy({ by: ["categoryId"], where: { status: "active" }, _count: { _all: true } }),
    prisma.ecomProduct.groupBy({ by: ["brandId"], where: { status: "active" }, _count: { _all: true } }),
  ]);
  const c = new Map((byCat as { categoryId: number | null; _count: { _all: number } }[]).map((r) => [r.categoryId, r._count._all]));
  const b = new Map((byBrand as { brandId: number | null; _count: { _all: number } }[]).map((r) => [r.brandId, r._count._all]));
  return {
    categories: (cats as { id: number; slug: string; name: string; image: string | null }[])
      .map((x) => ({ slug: x.slug, name: x.name, image: x.image, count: c.get(x.id) ?? 0 })).filter((x) => x.count > 0),
    brands: (brands as { id: number; name: string }[]).map((x) => ({ id: x.id, name: x.name, count: b.get(x.id) ?? 0 })).filter((x) => x.count > 0),
  };
}

/** Products for a homepage "Product row" block. */
export function getProductRow(block: { source: "latest" | "deals" | "top_rated" | "category" | "manual"; category: string; productIds: number[]; limit: number }): Promise<Awaited<ReturnType<typeof loadProductRow>>> {
  const key = `row:${block.source}:${block.category}:${block.productIds.join(",")}:${block.limit}`;
  return cached(key, FEED_DEPS, 30_000, () => loadProductRow(block));
}

async function loadProductRow(block: { source: "latest" | "deals" | "top_rated" | "category" | "manual"; category: string; productIds: number[]; limit: number }): Promise<{ products: FeedProduct[]; viewAll: string | null }> {
  const take = Math.max(1, Math.min(30, block.limit));
  if (block.source === "manual") {
    if (!block.productIds.length) return { products: [], viewAll: null };
    const rows = (await prisma.ecomProduct.findMany({ where: { id: { in: block.productIds }, status: "active" }, select: FEED_SELECT })) as FeedRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = block.productIds.map((id) => byId.get(id)).filter((r): r is FeedRow => !!r);
    return { products: publicProducts(await enrichProducts(ordered)), viewAll: null };
  }
  if (block.source === "category") {
    if (!block.category) return { products: [], viewAll: null };
    const rows = (await prisma.ecomProduct.findMany({
      where: { status: "active", category: { slug: block.category, status: "active" } }, orderBy: { createdAt: "desc" }, take, select: FEED_SELECT,
    })) as FeedRow[];
    return { products: publicProducts(await enrichProducts(rows)), viewAll: `/category?slug=${encodeURIComponent(block.category)}` };
  }
  if (block.source === "latest") {
    const rows = (await prisma.ecomProduct.findMany({ where: { status: "active" }, orderBy: { createdAt: "desc" }, take, select: FEED_SELECT })) as FeedRow[];
    return { products: publicProducts(await enrichProducts(rows)), viewAll: "/?sort=new" };
  }
  // Deals / top rated need live prices and ratings, so rank a recent pool.
  const pool = await enrichProducts((await prisma.ecomProduct.findMany({ where: { status: "active" }, orderBy: { createdAt: "desc" }, take: 400, select: FEED_SELECT })) as FeedRow[]);
  const ranked = block.source === "deals"
    ? pool.filter((p) => p.discountPct > 0 && p.stock !== "out").sort((a, b) => Number(!!b.dealEndsAt) - Number(!!a.dealEndsAt) || b.discountPct - a.discountPct)
    : pool.filter((p) => p.rating !== null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviews - a.reviews);
  return { products: publicProducts(ranked.slice(0, take)), viewAll: block.source === "deals" ? "/?sort=discount" : "/?sort=rating" };
}
