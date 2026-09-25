/**
 * Types and URL parsing for the storefront "Products For You" feed — no server
 * imports, so both the page/API (src/lib/shop-feed.ts) and the browser can use it.
 */

export type FeedSort = "relevance" | "new" | "price_asc" | "price_desc" | "rating" | "discount";
export const FEED_SORTS: { value: FeedSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "new", label: "New Arrivals" },
  { value: "price_asc", label: "Price (Low to High)" },
  { value: "price_desc", label: "Price (High to Low)" },
  { value: "rating", label: "Ratings" },
  { value: "discount", label: "Discount" },
];

export interface FeedFilters {
  q: string;
  cat: string[]; // category slugs
  sub: string; // subcategory slug (category pages)
  brand: number[];
  min: number | null;
  max: number | null;
  rating: number | null; // minimum average stars
  disc: number | null; // minimum % off
  inStock: boolean;
  sort: FeedSort;
  page: number;
}

export interface FeedProduct {
  id: number;
  slug: string;
  name: string;
  image: string | null;
  price: number;
  finalPrice: number;
  discountPct: number;
  rating: number | null; // average of approved reviews
  reviews: number;
  stock: "in" | "low" | "out" | "untracked";
  dealEndsAt: string | null; // live campaign ending within 3 days → countdown badge
  badge: string; // product badge_tag: none | new | best | hot | featured
}

export interface FeedResult { products: FeedProduct[]; total: number; page: number; pageCount: number }

export const FEED_PAGE_SIZE = 20;

export function parseFeedFilters(sp: URLSearchParams): FeedFilters {
  const num = (k: string) => { const v = Number(sp.get(k)); return sp.get(k) && Number.isFinite(v) && v > 0 ? v : null; };
  const list = (k: string) => (sp.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const sort = sp.get("sort") as FeedSort;
  const rating = num("rating");
  const disc = num("disc");
  return {
    q: (sp.get("q") ?? "").trim().slice(0, 100),
    cat: list("cat").map((s) => s.slice(0, 120)),
    sub: (sp.get("sub") ?? "").trim().slice(0, 120),
    brand: list("brand").map(Number).filter((n) => Number.isInteger(n) && n > 0),
    min: num("min"),
    max: num("max"),
    rating: rating && rating <= 5 ? rating : null,
    disc: disc && disc < 100 ? disc : null,
    inStock: sp.get("stock") === "in",
    sort: FEED_SORTS.some((s) => s.value === sort) ? sort : "relevance",
    page: Math.min(500, Math.max(1, Math.floor(Number(sp.get("page")) || 1))),
  };
}

