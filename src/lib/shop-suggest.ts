import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { enrichProducts, FEED_SELECT, getFeedFacets, publicProducts } from "@/lib/shop-feed";
import type { FeedProduct } from "@/lib/shop-feed-shared";

const DEPS = ["EcomProduct", "EcomProductReview", "EcomCampaign", "EcomCampaignTarget", "EcomCategory", "EcomBrand"] as const;

export interface SuggestCategory { slug: string; name: string; image: string | null; count: number }
export interface SuggestBrand { id: number; name: string; count: number }
export interface SuggestResult { categories: SuggestCategory[]; brands: SuggestBrand[]; products: FeedProduct[]; total: number }

type Row = Parameters<typeof enrichProducts>[0][number];

/** Search-as-you-type: a few matching categories, brands and products (every word must match). */
export function searchSuggest(raw: string): Promise<SuggestResult> {
  const q = raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
  return cached(`suggest:${q}`, DEPS, 30_000, async () => {
    const words = q.split(" ").filter(Boolean).slice(0, 5);
    if (!words.length) return { categories: [], brands: [], products: [], total: 0 };
    const where = {
      status: "active",
      AND: words.map((w) => ({ OR: [{ name: { contains: w } }, { sku: { contains: w } }, { category: { name: { contains: w } } }, { brand: { name: { contains: w } } }] })),
    };
    const [facets, rows, total] = await Promise.all([
      getFeedFacets(),
      prisma.ecomProduct.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 40, select: FEED_SELECT }),
      prisma.ecomProduct.count({ where }),
    ]);
    const has = (name: string) => words.every((w) => name.toLowerCase().includes(w));
    // Names that start with what was typed come first.
    const score = (name: string) => (name.toLowerCase().startsWith(q) ? 0 : name.toLowerCase().includes(q) ? 1 : 2);
    const items = publicProducts(await enrichProducts(rows as Row[]))
      .sort((a, b) => score(a.name) - score(b.name) || Number(a.stock === "out") - Number(b.stock === "out"))
      .slice(0, 6);
    return {
      categories: facets.categories.filter((c) => has(c.name)).slice(0, 3),
      brands: facets.brands.filter((b) => has(b.name)).slice(0, 2),
      products: items,
      total,
    };
  });
}

/** A category's newest products, for the Categories sheet. */
export function categoryPicks(slug: string): Promise<FeedProduct[]> {
  return cached(`picks:${slug}`, DEPS, 60_000, async () => {
    const rows = await prisma.ecomProduct.findMany({
      where: { status: "active", category: { slug, status: "active" } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12, select: FEED_SELECT,
    });
    return publicProducts(await enrichProducts(rows as Row[]));
  });
}
