import { prisma } from "@/lib/db";

/**
 * Data for /admin/ecommerce/barcode-print2.
 *
 * Built for a shop with thousands of products: the page does NOT load every
 * product. It loads only what you are likely to print today — products added
 * or restocked recently — and anything else is found with the search box,
 * which asks the server one page at a time.
 *
 * Days are India time (IST), so "today" means today in the shop.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 86_400_000;

export const istYmd = (d: Date): string => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const istStart = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);
const istEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999+05:30`);
const isYmd = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** How many products the first view loads. The search box goes to the server for the rest. */
export const BARCODE_PAGE_SIZE = 200;

export interface BarcodeProduct {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  salePrice: number | null;
  unit: string | null;
  stockQty: number | null;
  categoryId: number | null;
  categoryName: string | null;
  brandName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Added in the chosen date range (usually today). */
  isNew: boolean;
  /** Changed in the range but not added then — usually a restock or price change. */
  isUpdated: boolean;
}

export interface Barcodes2Cards {
  addedToday: number;
  updatedToday: number;
  addedInRange: number;
  updatedInRange: number;
  missingBarcode: number;
  shown: number;
  totalProducts: number;
  withBarcode: number;
}

export interface Barcodes2Data {
  /** The starting list: products added or changed in the range. */
  products: BarcodeProduct[];
  /** True when the range holds more than this page could load. */
  truncated: boolean;
  cards: Barcodes2Cards;
  categories: { id: number; name: string }[];
  /** Products asked for by ?ids= (the "Print Barcode" button on other pages). */
  preselected: BarcodeProduct[];
  footerText: string;
  range: { from: string; to: string };
  today: string;
}

export function parseBarcodeRange(sp: { from?: string; to?: string }): { from: string; to: string } {
  const today = istYmd(new Date());
  let from = isYmd(sp.from) ? sp.from : today;
  let to = isYmd(sp.to) ? sp.to : today;
  if (to < from) [from, to] = [to, from];
  const days = Math.round((istStart(to).getTime() - istStart(from).getTime()) / DAY_MS);
  if (days > 366) from = istYmd(new Date(istStart(to).getTime() - 366 * DAY_MS));
  return { from, to };
}

type RawProduct = {
  id: number; name: string; sku: string | null; barcode: string | null; price: unknown; salePrice: unknown;
  unit: string | null; stockQty: number | null; categoryId: number | null; createdAt: Date; updatedAt: Date;
  category: { name: string } | null; brand: { name: string } | null;
};

export const BARCODE_SELECT = {
  id: true, name: true, sku: true, barcode: true, price: true, salePrice: true, unit: true, stockQty: true,
  categoryId: true, createdAt: true, updatedAt: true,
  category: { select: { name: true } }, brand: { select: { name: true } },
} as const;

export function toBarcodeProduct(p: RawProduct, rangeStart: number, rangeEnd: number): BarcodeProduct {
  const created = p.createdAt.getTime();
  const updated = p.updatedAt.getTime();
  const isNew = created >= rangeStart && created <= rangeEnd;
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    price: Number(p.price),
    salePrice: p.salePrice === null || p.salePrice === undefined ? null : Number(p.salePrice),
    unit: p.unit,
    stockQty: p.stockQty,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    brandName: p.brand?.name ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    isNew,
    isUpdated: !isNew && updated >= rangeStart && updated <= rangeEnd,
  };
}

export async function getBarcodes2Data(range: { from: string; to: string }, preselectIds: number[]): Promise<Barcodes2Data> {
  const rangeStart = istStart(range.from).getTime();
  const rangeEnd = istEnd(range.to).getTime();
  const inRange = { gte: new Date(rangeStart), lte: new Date(rangeEnd) };
  const todayYmd = istYmd(new Date());
  const todayStart = istStart(todayYmd);
  const todayEnd = istEnd(todayYmd);

  const [recent, recentCount, categories, biz, counts, preselectedRows] = await Promise.all([
    // Added or changed in the range — newest first, capped so a huge range can't stall the page.
    prisma.ecomProduct.findMany({
      where: { OR: [{ createdAt: inRange }, { updatedAt: inRange }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: BARCODE_PAGE_SIZE,
      select: BARCODE_SELECT,
    }),
    prisma.ecomProduct.count({ where: { OR: [{ createdAt: inRange }, { updatedAt: inRange }] } }),
    prisma.ecomCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" }, select: { barcodeFooterText: true } }),
    Promise.all([
      prisma.ecomProduct.count(),
      prisma.ecomProduct.count({ where: { NOT: [{ barcode: null }, { barcode: "" }] } }),
      prisma.ecomProduct.count({ where: { createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.ecomProduct.count({ where: { updatedAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.ecomProduct.count({ where: { OR: [{ barcode: null }, { barcode: "" }] } }),
      prisma.ecomProduct.count({ where: { createdAt: inRange } }),
    ]),
    preselectIds.length
      ? prisma.ecomProduct.findMany({ where: { id: { in: preselectIds.slice(0, 200) } }, select: BARCODE_SELECT })
      : Promise.resolve([]),
  ]);

  const [totalProducts, withBarcode, addedToday, updatedTodayRaw, missingBarcode, addedInRange] = counts;

  return {
    products: (recent as RawProduct[]).map((p) => toBarcodeProduct(p, rangeStart, rangeEnd)),
    truncated: recentCount > BARCODE_PAGE_SIZE,
    cards: {
      addedToday,
      // "Updated today" shouldn't double-count a product that was also added today.
      updatedToday: Math.max(0, updatedTodayRaw - addedToday),
      addedInRange,
      updatedInRange: Math.max(0, recentCount - addedInRange),
      missingBarcode,
      shown: Math.min(recentCount, BARCODE_PAGE_SIZE),
      totalProducts,
      withBarcode,
    },
    categories: categories as { id: number; name: string }[],
    preselected: (preselectedRows as RawProduct[]).map((p) => toBarcodeProduct(p, rangeStart, rangeEnd)),
    footerText: biz?.barcodeFooterText ?? "",
    range,
    today: todayYmd,
  };
}
