import { prisma } from "@/lib/db";
import { campaignPricingFor } from "@/lib/campaign-pricing";
import { LOW_STOCK_LIMIT } from "@/components/admin/products2/filters";

/**
 * Catalog lookups for Push Manager 2's "what are we promoting?" pickers —
 * products (with filters), categories/subcategories and brands — plus the
 * storefront URL each one should open.
 */

export interface PushCatalog {
  categories: { id: number; name: string; slug: string; image: string | null; productCount: number;
    subcategories: { id: number; name: string; slug: string; productCount: number }[] }[];
  brands: { id: number; name: string; slug: string; logo: string | null; productCount: number }[];
}

/** Active categories (with their active subcategories) and brands, each with a live-product count. */
export async function getPushCatalog(): Promise<PushCatalog> {
  const [cats, subs, brands, byCat, bySub, byBrand] = await Promise.all([
    prisma.ecomCategory.findMany({ where: { status: "active" }, orderBy: [{ serial: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true, image: true } }),
    prisma.ecomSubcategory.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, categoryId: true } }),
    prisma.ecomBrand.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, logo: true } }),
    prisma.ecomProduct.groupBy({ by: ["categoryId"], where: { status: "active" }, _count: { _all: true } }),
    prisma.ecomProduct.groupBy({ by: ["subcategoryId"], where: { status: "active" }, _count: { _all: true } }),
    prisma.ecomProduct.groupBy({ by: ["brandId"], where: { status: "active" }, _count: { _all: true } }),
  ]);
  type G = { _count: { _all: number } };
  const countMap = (rows: (G & Record<string, unknown>)[], key: string) =>
    new Map(rows.map((r) => [r[key] as number | null, r._count._all]));
  const catCount = countMap(byCat as (G & Record<string, unknown>)[], "categoryId");
  const subCount = countMap(bySub as (G & Record<string, unknown>)[], "subcategoryId");
  const brandCount = countMap(byBrand as (G & Record<string, unknown>)[], "brandId");

  return {
    categories: (cats as { id: number; name: string; slug: string; image: string | null }[]).map((c) => ({
      ...c,
      productCount: catCount.get(c.id) ?? 0,
      subcategories: (subs as { id: number; name: string; slug: string; categoryId: number }[])
        .filter((s) => s.categoryId === c.id)
        .map((s) => ({ id: s.id, name: s.name, slug: s.slug, productCount: subCount.get(s.id) ?? 0 })),
    })),
    brands: (brands as { id: number; name: string; slug: string; logo: string | null }[]).map((b) => ({ ...b, productCount: brandCount.get(b.id) ?? 0 })),
  };
}

export type StockFilter = "all" | "in" | "low" | "out";
export type ProductSort = "newest" | "name" | "price_asc" | "price_desc" | "discount" | "stock_low";

export interface ProductFilters {
  q: string;
  categoryId: number | null;
  subcategoryId: number | null;
  brandId: number | null;
  stock: StockFilter;
  onSale: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  sort: ProductSort;
  page: number;
}

export interface PushProductHit {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
  image: string | null;
  price: number; // regular price
  finalPrice: number; // what a shopper pays right now (sale or live campaign price)
  discountPct: number; // 0 when not discounted
  onCampaign: boolean;
  stockQty: number | null; // null = not tracked (digital etc.)
  stockState: "in" | "low" | "out" | "untracked";
  badgeTag: string;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  createdAt: string;
}

export const PRODUCT_PAGE_SIZE = 12;
// Discount sorting and the price range need the final price, which depends on
// live campaigns — so those are applied in memory over at most this many matches.
const IN_MEMORY_CAP = 2000;

export function parseProductFilters(sp: URLSearchParams): ProductFilters {
  const num = (k: string) => { const v = Number(sp.get(k)); return sp.get(k) && Number.isFinite(v) && v > 0 ? v : null; };
  const stock = sp.get("stock");
  const sort = sp.get("sort");
  return {
    q: (sp.get("q") ?? "").trim().slice(0, 100),
    categoryId: num("categoryId"),
    subcategoryId: num("subcategoryId"),
    brandId: num("brandId"),
    stock: stock === "in" || stock === "low" || stock === "out" ? stock : "all",
    onSale: sp.get("onSale") === "1",
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    sort: (["newest", "name", "price_asc", "price_desc", "discount", "stock_low"] as const).includes(sort as ProductSort) ? (sort as ProductSort) : "newest",
    page: Math.max(1, Math.floor(Number(sp.get("page")) || 1)),
  };
}

export async function searchPushProducts(f: ProductFilters): Promise<{ products: PushProductHit[]; total: number; page: number; pageCount: number; capped: boolean }> {
  const and: Record<string, unknown>[] = [];
  if (f.q) and.push({ OR: [{ name: { contains: f.q } }, { sku: { contains: f.q } }, { barcode: { contains: f.q } }] });
  if (f.subcategoryId) and.push({ subcategoryId: f.subcategoryId });
  else if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.brandId) and.push({ brandId: f.brandId });
  // Stock rules match Products 2: only physical products with a count are tracked.
  if (f.stock === "out") and.push({ productType: "physical", stockQty: { lte: 0 } });
  if (f.stock === "low") and.push({ productType: "physical", stockQty: { gt: 0, lte: LOW_STOCK_LIMIT } });
  if (f.stock === "in") and.push({ OR: [{ productType: { not: "physical" } }, { stockQty: null }, { stockQty: { gt: 0 } }] });
  const where = { status: "active", AND: and };

  const needsFinalPrice = f.onSale || f.minPrice !== null || f.maxPrice !== null || f.sort === "discount" || f.sort === "price_asc" || f.sort === "price_desc";
  const orderBy =
    f.sort === "name" ? [{ name: "asc" as const }] :
    f.sort === "stock_low" ? [{ stockQty: "asc" as const }, { name: "asc" as const }] :
    [{ createdAt: "desc" as const }, { id: "desc" as const }];

  const select = {
    id: true, name: true, slug: true, sku: true, image: true, price: true, salePrice: true, stockQty: true, productType: true,
    badgeTag: true, categoryId: true, brandId: true, createdAt: true,
    category: { select: { name: true } }, subcategory: { select: { name: true } }, brand: { select: { name: true } },
  } as const;
  type Row = {
    id: number; name: string; slug: string; sku: string | null; image: string | null; price: unknown; salePrice: unknown;
    stockQty: number | null; productType: string; badgeTag: string; categoryId: number | null; brandId: number | null; createdAt: Date;
    category: { name: string } | null; subcategory: { name: string } | null; brand: { name: string } | null;
  };

  let rows: Row[];
  let total: number;
  let capped = false;
  if (needsFinalPrice) {
    rows = (await prisma.ecomProduct.findMany({ where, orderBy, take: IN_MEMORY_CAP + 1, select })) as Row[];
    capped = rows.length > IN_MEMORY_CAP;
    rows = rows.slice(0, IN_MEMORY_CAP);
    total = 0; // set after in-memory filtering
  } else {
    [rows, total] = await Promise.all([
      prisma.ecomProduct.findMany({ where, orderBy, skip: (f.page - 1) * PRODUCT_PAGE_SIZE, take: PRODUCT_PAGE_SIZE, select }) as Promise<Row[]>,
      prisma.ecomProduct.count({ where }),
    ]);
  }

  const campaign = await campaignPricingFor(rows.map((r) => ({ id: r.id, categoryId: r.categoryId, brandId: r.brandId, price: r.price, salePrice: r.salePrice })));
  let hits: PushProductHit[] = rows.map((r) => {
    const price = Number(r.price);
    const sale = r.salePrice === null || r.salePrice === undefined ? 0 : Number(r.salePrice);
    const camp = campaign.get(r.id);
    const finalPrice = camp ? camp.unitPrice : sale > 0 && sale < price ? sale : price;
    const tracked = r.productType === "physical" && r.stockQty !== null;
    return {
      id: r.id, name: r.name, slug: r.slug, sku: r.sku, image: r.image, price, finalPrice,
      discountPct: price > 0 && finalPrice < price ? Math.round(((price - finalPrice) / price) * 100) : 0,
      onCampaign: !!camp,
      stockQty: tracked ? r.stockQty : null,
      stockState: !tracked ? "untracked" : r.stockQty! <= 0 ? "out" : r.stockQty! <= LOW_STOCK_LIMIT ? "low" : "in",
      badgeTag: r.badgeTag,
      category: r.category?.name ?? null, subcategory: r.subcategory?.name ?? null, brand: r.brand?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });

  if (needsFinalPrice) {
    if (f.onSale) hits = hits.filter((h) => h.discountPct > 0);
    if (f.minPrice !== null) hits = hits.filter((h) => h.finalPrice >= f.minPrice!);
    if (f.maxPrice !== null) hits = hits.filter((h) => h.finalPrice <= f.maxPrice!);
    if (f.sort === "discount") hits.sort((a, b) => b.discountPct - a.discountPct || a.name.localeCompare(b.name));
    if (f.sort === "price_asc") hits.sort((a, b) => a.finalPrice - b.finalPrice);
    if (f.sort === "price_desc") hits.sort((a, b) => b.finalPrice - a.finalPrice);
    total = hits.length;
    hits = hits.slice((f.page - 1) * PRODUCT_PAGE_SIZE, f.page * PRODUCT_PAGE_SIZE);
  }

  const pageCount = Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE));
  return { products: hits, total, page: Math.min(f.page, pageCount), pageCount, capped };
}
