import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { campaignPriceFor, type CampaignDef, type CampaignPrice } from "@/lib/campaign-core";
import { loadLiveCampaigns } from "@/lib/campaign-pricing";
import { parseCartKey, type CartMap } from "@/lib/cart-session";

/**
 * Cart → priced lines, shared by the cart badge, cart page, checkout page and
 * the checkout API so they can never disagree. A product sold in sizes is
 * priced from the chosen size (its MRP / selling price, and its own stock
 * when tracked); a live campaign can only lower that price.
 */

type Client = Prisma.TransactionClient | typeof prisma;

const PRODUCT_SELECT = {
  id: true, slug: true, name: true, image: true, price: true, salePrice: true, stockQty: true, productType: true,
  categoryId: true, subcategoryId: true, brandId: true, gstRate: true, hsnCode: true, status: true,
} as const;

export type CartProduct = {
  id: number; slug: string; name: string; image: string | null; price: unknown; salePrice: unknown; stockQty: number | null; productType: string;
  categoryId: number | null; subcategoryId: number | null; brandId: number | null; gstRate: unknown; hsnCode: string | null; status: string;
};
export type CartSize = { id: number; productId: number; label: string; mrp: unknown; price: unknown; stockQty: number | null };

export interface CartLine {
  key: string;
  product: CartProduct;
  size: CartSize | null;
  /** Product name with the size, e.g. "Cotton Kurta (XL)" — also the order-item snapshot. */
  name: string;
  qty: number;
  mrp: number;
  unitPrice: number;
  campaign: CampaignPrice | null;
  /** Most that can be bought right now (null = not tracked). */
  maxQty: number | null;
}

/** Price and stock limit for one product (and optional size). */
export function priceLine(product: CartProduct, size: CartSize | null, campaigns: readonly CampaignDef[], now: Date) {
  const mrp = size ? Number(size.mrp) : Number(product.price);
  const rawSale = size ? (size.price === null ? null : Number(size.price)) : product.salePrice === null ? null : Number(product.salePrice);
  const sale = rawSale !== null && rawSale > 0 && rawSale < mrp ? rawSale : null;
  const campaign = campaignPriceFor({ id: product.id, categoryId: product.categoryId, brandId: product.brandId, price: mrp, salePrice: sale }, campaigns, now);
  const unitPrice = campaign ? campaign.unitPrice : sale ?? mrp;
  const physical = product.productType === "physical";
  const limits = [physical ? product.stockQty : null, physical && size ? size.stockQty : null].filter((n): n is number => n !== null);
  return { mrp, unitPrice, campaign, maxQty: limits.length ? Math.max(0, Math.min(...limits)) : null };
}

export async function loadCartLines(cart: CartMap, opts: { client?: Client; campaigns?: readonly CampaignDef[]; activeOnly?: boolean } = {}): Promise<CartLine[]> {
  const parsed = Object.entries(cart).flatMap(([key, qty]) => { const k = parseCartKey(key); return k && qty > 0 ? [{ key, qty, ...k }] : []; });
  if (parsed.length === 0) return [];
  const db = opts.client ?? prisma;
  const [products, sizes, campaigns] = await Promise.all([
    db.ecomProduct.findMany({ where: { id: { in: [...new Set(parsed.map((p) => p.productId))] }, ...(opts.activeOnly === false ? {} : { status: "active" }) }, select: PRODUCT_SELECT }) as Promise<CartProduct[]>,
    parsed.some((p) => p.sizeId)
      ? (db.ecomProductSize.findMany({ where: { id: { in: parsed.flatMap((p) => (p.sizeId ? [p.sizeId] : [])) } }, select: { id: true, productId: true, label: true, mrp: true, price: true, stockQty: true } }) as Promise<CartSize[]>)
      : Promise.resolve([] as CartSize[]),
    opts.campaigns ? Promise.resolve(opts.campaigns) : loadLiveCampaigns().catch(() => [] as CampaignDef[]),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const sizeById = new Map(sizes.map((z) => [z.id, z]));
  const now = new Date();
  const lines: CartLine[] = [];
  for (const it of parsed) {
    const product = byId.get(it.productId);
    if (!product) continue;
    const size = it.sizeId ? sizeById.get(it.sizeId) ?? null : null;
    if (it.sizeId && (!size || size.productId !== product.id)) continue; // size was deleted
    const priced = priceLine(product, size, campaigns, now);
    lines.push({ key: it.key, product, size, name: size ? `${product.name} (${size.label})` : product.name, qty: it.qty, ...priced });
  }
  return lines;
}

export const cartTotal = (lines: CartLine[]) => lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
