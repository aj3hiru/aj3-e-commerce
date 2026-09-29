import { prisma } from "@/lib/db";
import { enrichProducts, publicProducts, FEED_SELECT, type FeedRow } from "@/lib/shop-feed";
import type { FeedProduct } from "@/lib/shop-feed-shared";
import { loadLiveCampaigns } from "@/lib/campaign-pricing";
import { priceLine, type CartProduct, type CartSize } from "@/lib/cart-lines";
import { LOW_STOCK_LIMIT } from "@/components/admin/products2/filters";
import type { ProductPageConfig } from "@/types/product-page";
import { packLabel, packSortKey, sizeLabelKey, variantLabel } from "@/lib/product-variants-shared";
import { getDeliverySettings, type DeliverySettings } from "@/lib/delivery-charge";
import { cached } from "@/lib/cache";

/** Everything the Meesho-style product page shows, already priced and serialisable. */
export interface ProductPageData {
  product: {
    id: number; slug: string; name: string; description: string | null; sku: string | null; unit: string | null; badge: string;
    /** "1 KG" — quantity with the unit (or just the unit). */
    pack: string | null;
    brand: string | null; category: { name: string; slug: string } | null; subcategory: { name: string; slug: string } | null; images: string[];
  };
  price: { mrp: number; final: number; discountPct: number; dealEndsAt: string | null };
  stock: "in" | "low" | "out" | "untracked";
  stockQty: number | null;
  sizes: { id: number; label: string; mrp: number; final: number; discountPct: number; stock: "in" | "low" | "out" | "untracked"; isDefault: boolean }[];
  /** Other products linked as variants (this one included, flagged `current`); each opens its own page. */
  variants: { id: number; slug: string; label: string; mrp: number; final: number; discountPct: number; stock: "in" | "low" | "out" | "untracked"; current: boolean }[];
  specs: { name: string; value: string }[];
  rating: { avg: number | null; count: number; withText: number; dist: [number, number, number, number, number] };
  reviews: { id: number; name: string; rating: number; text: string | null; date: string }[];
  offer: { price: number; count: number; codes: { code: string; title: string; label: string }[] } | null;
  related: FeedProduct[];
  /** Computer screens: best sellers / newest beside the reviews (Customizer → Ratings & reviews). */
  side: FeedProduct[];
  store: { name: string; rating: number | null; count: number };
  /** Business Settings → Delivery Charge, so the page says “Free Delivery” only when this price really ships free. */
  delivery: DeliverySettings;
}

/** Active products, best sellers of the last 60 days first (then the newest), as ids — refreshed every 10 minutes. */
function sideProductIds(source: "trending" | "latest"): Promise<number[]> {
  return cached(`pp:side:${source}`, ["EcomOrder", "EcomProduct"], 10 * 60_000, async () => {
    const ids: number[] = [];
    if (source === "trending") {
      const top = await prisma.ecomOrderItem.groupBy({
        by: ["productId"], where: { order: { createdAt: { gte: new Date(Date.now() - 60 * 86_400_000) }, orderStatus: { not: "Canceled" } } },
        _sum: { qty: true }, orderBy: { _sum: { qty: "desc" } }, take: 40,
      });
      const active = new Set((await prisma.ecomProduct.findMany({ where: { id: { in: top.map((t) => t.productId) }, status: "active" }, select: { id: true } })).map((p) => p.id));
      ids.push(...top.map((t) => t.productId).filter((id) => active.has(id)));
    }
    if (ids.length < 24) {
      const latest = await prisma.ecomProduct.findMany({ where: { status: "active", id: { notIn: ids } }, orderBy: { createdAt: "desc" }, take: 24 - ids.length, select: { id: true } });
      ids.push(...latest.map((p) => p.id));
    }
    return ids;
  });
}

const pct = (mrp: number, final: number) => (mrp > 0 && final < mrp ? Math.min(final > 0 ? 99 : 100, Math.round(((mrp - final) / mrp) * 100)) : 0);
const stockOf = (physical: boolean, qty: number | null) => (!physical || qty === null ? "untracked" : qty <= 0 ? "out" : qty <= LOW_STOCK_LIMIT ? "low" : "in") as ProductPageData["stock"];

export async function loadProductPage(slug: string, cfg: ProductPageConfig): Promise<ProductPageData | null> {
  const p = await prisma.ecomProduct.findFirst({
    where: { slug, status: "active" },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      brand: { select: { name: true } },
      category: { select: { name: true, slug: true, status: true } },
      subcategory: { select: { name: true, slug: true, status: true } },
      sizes: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      specs: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!p) return null;

  const now = new Date();
  const hidden = new Set(cfg.hidden);
  const [campaigns, reviewRows, dist, storeAgg, biz, relatedRows, variantRows, delivery] = await Promise.all([
    loadLiveCampaigns().catch(() => []),
    hidden.has("reviews") ? Promise.resolve([]) : prisma.ecomProductReview.findMany({ where: { productId: p.id, status: "approved" }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.ecomProductReview.groupBy({ by: ["rating"], where: { productId: p.id, status: "approved" }, _count: { _all: true } }),
    prisma.ecomProductReview.aggregate({ where: { status: "approved" }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" }, select: { businessName: true } }),
    hidden.has("related") ? Promise.resolve([]) : prisma.ecomProduct.findMany({
      where: { status: "active", id: { not: p.id }, ...(cfg.related.source === "category" && p.categoryId ? { categoryId: p.categoryId } : {}) },
      orderBy: { createdAt: "desc" }, take: cfg.related.limit, select: FEED_SELECT,
    }),
    p.variantGroup
      ? prisma.ecomProduct.findMany({ where: { variantGroup: p.variantGroup, status: "active" }, include: { sizes: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } }, take: 40 })
      : Promise.resolve([]),
    getDeliverySettings(),
  ]);

  // Main price: the default size when the product is sold in sizes.
  const cp = p as unknown as CartProduct;
  const physical = p.productType === "physical";
  const sizes = p.sizes.map((z) => {
    const pr = priceLine(cp, z as unknown as CartSize, campaigns, now);
    const lim = pr.maxQty;
    return { id: z.id, label: z.label, mrp: pr.mrp, final: pr.unitPrice, discountPct: pct(pr.mrp, pr.unitPrice), isDefault: z.isDefault,
      stock: stockOf(physical, lim) };
  });
  // A product with its own Quantity (500 Gram at its own price) is the first choice; the Sizes / Units
  // rows are the other choices (id 0 = the product itself, bought without a size).
  const ownPack = p.quantity !== null && Number(p.quantity) > 0 ? packLabel(Number(p.quantity), p.unit) : null;
  const def = ownPack ? null : p.sizes.find((z) => z.isDefault) ?? p.sizes[0] ?? null;
  const main = priceLine(cp, (def as unknown as CartSize) ?? null, campaigns, now);
  if (ownPack && sizes.length) {
    const others = sizes.filter((z) => z.label.trim().toLowerCase() !== ownPack.toLowerCase()).map((z) => ({ ...z, isDefault: false }));
    sizes.splice(0, sizes.length, ...[
      { id: 0, label: ownPack, mrp: main.mrp, final: main.unitPrice, discountPct: pct(main.mrp, main.unitPrice), isDefault: true, stock: stockOf(physical, main.maxQty) },
      ...others,
    ].sort((a, b) => sizeLabelKey(a.label) - sizeLabelKey(b.label)));
  }
  const campEnds = main.campaign ? campaigns.find((c) => c.id === main.campaign!.campaignId)?.endsAt ?? null : null;
  const dealEndsAt = campEnds && campEnds.getTime() > now.getTime() && campEnds.getTime() - now.getTime() < 3 * 86_400_000 ? campEnds.toISOString() : null;

  const d = [0, 0, 0, 0, 0] as [number, number, number, number, number];
  let sum = 0, count = 0;
  for (const r of dist as { rating: number; _count: { _all: number } }[]) {
    const i = Math.min(5, Math.max(1, r.rating)) - 1;
    d[i] += r._count._all; sum += r.rating * r._count._all; count += r._count._all;
  }

  // Coupons that apply to this product right now → "₹x with N Special Offers".
  let offer: ProductPageData["offer"] = null;
  if (cfg.info.showOffer && !hidden.has("info")) {
    const coupons = await prisma.ecomCoupon.findMany({
      where: {
        status: "active", isPaused: false,
        OR: [{ appliesTo: "all" }, { appliesTo: "product", productId: p.id },
          ...(p.categoryId ? [{ appliesTo: "category", categoryId: p.categoryId }] : []),
          ...(p.subcategoryId ? [{ appliesTo: "subcategory", subcategoryId: p.subcategoryId }] : [])],
      },
      take: 20,
    });
    const live = coupons.filter((c) => (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt >= now) && c.usedCount < c.numberOfTimes);
    if (live.length) {
      const priced = live.map((c) => {
        const v = Number(c.discountValue);
        const off = c.discountType === "percentage" ? main.unitPrice * (v / 100) : Math.min(v, main.unitPrice);
        return { code: c.code, title: c.title, label: c.discountType === "percentage" ? `${v}% off` : `₹${v} off`, price: Math.max(0, main.unitPrice - off) };
      }).sort((a, b) => a.price - b.price);
      if (priced[0].price < main.unitPrice) {
        offer = { price: Math.round(priced[0].price * 100) / 100, count: priced.length, codes: priced.map(({ code, title, label }) => ({ code, title, label })) };
      }
    }
  }

  // Each variant priced like its own page (default size, live campaigns).
  type VRow = { id: number; slug: string; name: string; quantity: unknown; unit: string | null; productType: string; sizes: { isDefault: boolean; label: string }[] };
  const variants = (variantRows as VRow[]).length > 1
    ? (variantRows as VRow[])
        .map((v) => {
          const vd = v.sizes.find((z) => z.isDefault) ?? v.sizes[0] ?? null;
          const pr = priceLine(v as unknown as CartProduct, (vd as unknown as CartSize) ?? null, campaigns, now);
          const q = v.quantity === null || v.quantity === undefined ? null : Number(v.quantity);
          return {
            id: v.id, slug: v.slug, label: variantLabel({ quantity: q, unit: v.unit, name: v.name, sizeLabel: vd?.label ?? null }), mrp: pr.mrp, final: pr.unitPrice, discountPct: pct(pr.mrp, pr.unitPrice),
            stock: stockOf(v.productType === "physical", pr.maxQty), current: v.id === p.id, q, unit: v.unit,
          };
        })
        .sort((a, b) => packSortKey(a.q, a.unit) - packSortKey(b.q, b.unit) || a.final - b.final)
        .map((v) => ({ id: v.id, slug: v.slug, label: v.label, mrp: v.mrp, final: v.final, discountPct: v.discountPct, stock: v.stock, current: v.current }))
    : [];

  const related = relatedRows.length ? publicProducts(await enrichProducts(relatedRows as FeedRow[])) : [];
  let side: FeedProduct[] = [];
  if (cfg.reviews.side && !hidden.has("reviews")) {
    const skip = new Set([p.id, ...related.map((r) => r.id)]);
    const ids = (await sideProductIds(cfg.reviews.sideSource).catch(() => [] as number[])).filter((id) => !skip.has(id)).slice(0, 12);
    if (ids.length) {
      const rows = await prisma.ecomProduct.findMany({ where: { id: { in: ids }, status: "active" }, select: FEED_SELECT });
      const at = new Map(ids.map((id, i) => [id, i]));
      side = publicProducts(await enrichProducts(rows as FeedRow[])).sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
    }
  }
  const images = [p.image, ...p.images.map((i) => i.image)].filter((x): x is string => !!x);

  return {
    product: {
      id: p.id, slug: p.slug, name: p.name, description: p.description, sku: p.sku, unit: p.unit, badge: p.badgeTag,
      pack: packLabel(p.quantity === null ? null : Number(p.quantity), p.unit),
      brand: p.brand?.name ?? null, category: p.category && p.category.status === "active" ? { name: p.category.name, slug: p.category.slug } : null,
      subcategory: p.subcategory && p.subcategory.status === "active" ? { name: p.subcategory.name, slug: p.subcategory.slug } : null, images: [...new Set(images)],
    },
    price: { mrp: main.mrp, final: main.unitPrice, discountPct: pct(main.mrp, main.unitPrice), dealEndsAt },
    stock: stockOf(physical, main.maxQty),
    stockQty: main.maxQty,
    sizes,
    variants,
    specs: p.specs.map((s) => ({ name: s.name, value: s.value })),
    rating: { avg: count ? Math.round((sum / count) * 10) / 10 : null, count, withText: (reviewRows as { reviewText: string | null }[]).filter((r) => r.reviewText).length, dist: d },
    reviews: (reviewRows as { id: number; customerName: string; rating: number; reviewText: string | null; createdAt: Date }[])
      .map((r) => ({ id: r.id, name: r.customerName, rating: r.rating, text: r.reviewText, date: r.createdAt.toISOString() })),
    offer,
    related,
    side,
    delivery,
    store: {
      name: biz?.businessName ?? "Our Store",
      rating: storeAgg._avg.rating ? Math.round(storeAgg._avg.rating * 10) / 10 : null,
      count: storeAgg._count._all,
    },
  };
}
