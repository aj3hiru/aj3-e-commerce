import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { isSafeHref } from "@/types/storefront";
import {
  ASSURANCE_ICONS, DEFAULT_PRODUCT_PAGE, PP_DEFAULT_ORDER, TRUST_ICONS,
  type AssuranceIcon, type PPSectionKey, type ProductPageConfig, type TrustIcon,
} from "@/types/product-page";

/**
 * Product page settings (storefront_settings "productPage" = live,
 * "productPageDraft" = what the Customizer is editing). Everything goes
 * through sanitizeProductPage(), so a bad value can never break the page.
 */

const LIVE = "productPage";
const DRAFT = "productPageDraft";

type R = Record<string, unknown>;
const obj = (v: unknown): R => (v && typeof v === "object" ? (v as R) : {});
const str = (v: unknown, max: number, fb: string) => (typeof v === "string" ? v.trim().slice(0, max) : fb);
const bool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);
const color = (v: unknown, fb: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : fb);
const int = (v: unknown, min: number, max: number, fb: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb; };
const href = (v: unknown, fb: string) => { const h = str(v, 300, ""); return h && isSafeHref(h) ? h : fb; };
const id = (v: unknown) => str(v, 40, "").replace(/[^\w-]/g, "") || Math.random().toString(36).slice(2, 10);
const image = (v: unknown) => { const s = str(v, 400, ""); return /^uploads\/[\w./-]+\.(jpe?g|png|gif|webp|svg)$/i.test(s) && !s.includes("..") ? s : /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : ""; };

export function sanitizeProductPage(input: unknown): ProductPageConfig {
  const r = obj(input), D = DEFAULT_PRODUCT_PAGE;
  const keys = new Set<string>(PP_DEFAULT_ORDER);
  // "similar" was replaced by the photo thumbnails, in the same place.
  const rename = (k: unknown) => (k === "similar" ? "thumbs" : k);
  // Keep the saved order; a section added since goes after its neighbour in the default order.
  const order = [...new Set(Array.isArray(r.order) ? r.order.map(rename).filter((k): k is PPSectionKey => typeof k === "string" && keys.has(k)) : [])];
  PP_DEFAULT_ORDER.forEach((k, i) => {
    if (order.includes(k)) return;
    const prev = i > 0 ? order.indexOf(PP_DEFAULT_ORDER[i - 1]) : -1;
    order.splice(prev + 1, 0, k);
  });
  const hidden = Array.isArray(r.hidden) ? [...new Set(r.hidden.map(rename).filter((k): k is PPSectionKey => typeof k === "string" && keys.has(k)))] : D.hidden;

  const g = obj(r.gallery), t = obj(r.trust), th = obj(r.thumbs), ct = obj(r.cart), inf = obj(r.info), sz = obj(r.sizes), sb = obj(r.soldBy);
  const h = obj(r.highlights), rv = obj(r.reviews), as = obj(r.assurance), ac = obj(r.actions), rl = obj(r.related);

  return {
    accent: color(r.accent, D.accent),
    order, hidden,
    gallery: { dots: bool(g.dots, D.gallery.dots), zoom: bool(g.zoom, D.gallery.zoom) },
    trust: {
      badge: str(t.badge, 20, D.trust.badge), badgeColor: color(t.badgeColor, D.trust.badgeColor), bg: color(t.bg, D.trust.bg),
      items: Array.isArray(t.items)
        ? t.items.slice(0, 3).map((x) => { const o = obj(x); return { id: id(o.id), icon: TRUST_ICONS.includes(o.icon as TrustIcon) ? (o.icon as TrustIcon) : "check", label: str(o.label, 30, "") }; }).filter((x) => x.label)
        : D.trust.items,
    },
    thumbs: { title: str(th.title, 40, D.thumbs.title), showCount: bool(th.showCount, D.thumbs.showCount) },
    info: {
      showWishlist: bool(inf.showWishlist, D.info.showWishlist), showShare: bool(inf.showShare, D.info.showShare),
      showOffer: bool(inf.showOffer, D.info.showOffer), showDeal: bool(inf.showDeal, D.info.showDeal),
      showStock: bool(inf.showStock, D.info.showStock), showRating: bool(inf.showRating, D.info.showRating),
      deliveryText: str(inf.deliveryText, 40, D.info.deliveryText), deliveryStrike: str(inf.deliveryStrike, 20, D.info.deliveryStrike),
    },
    sizes: { title: str(sz.title, 40, D.sizes.title) || D.sizes.title, showPrice: bool(sz.showPrice, D.sizes.showPrice) },
    soldBy: {
      title: str(sb.title, 40, D.soldBy.title) || D.soldBy.title, name: str(sb.name, 80, ""), showRating: bool(sb.showRating, D.soldBy.showRating),
      showViewShop: bool(sb.showViewShop, D.soldBy.showViewShop), viewShopLabel: str(sb.viewShopLabel, 24, D.soldBy.viewShopLabel) || D.soldBy.viewShopLabel,
      viewShopUrl: href(sb.viewShopUrl, D.soldBy.viewShopUrl),
    },
    highlights: {
      title: str(h.title, 40, D.highlights.title) || D.highlights.title, showCopy: bool(h.showCopy, D.highlights.showCopy),
      showBrand: bool(h.showBrand, D.highlights.showBrand), showCategory: bool(h.showCategory, D.highlights.showCategory),
      showUnit: bool(h.showUnit, D.highlights.showUnit), showSku: bool(h.showSku, D.highlights.showSku),
      detailsTitle: str(h.detailsTitle, 40, D.highlights.detailsTitle) || D.highlights.detailsTitle, detailsOpen: bool(h.detailsOpen, D.highlights.detailsOpen),
    },
    reviews: {
      title: str(rv.title, 50, D.reviews.title) || D.reviews.title, showBars: bool(rv.showBars, D.reviews.showBars),
      perPage: int(rv.perPage, 1, 20, D.reviews.perPage), allowWrite: bool(rv.allowWrite, D.reviews.allowWrite),
    },
    assurance: {
      bg: color(as.bg, D.assurance.bg),
      items: Array.isArray(as.items)
        ? as.items.slice(0, 4).map((x) => { const o = obj(x); return { id: id(o.id), icon: ASSURANCE_ICONS.includes(o.icon as AssuranceIcon) ? (o.icon as AssuranceIcon) : "price", image: image(o.image), label: str(o.label, 30, "") }; }).filter((x) => x.label)
        : D.assurance.items,
    },
    actions: {
      showCart: bool(ac.showCart, D.actions.showCart), showBuy: bool(ac.showBuy, D.actions.showBuy),
      cartLabel: str(ac.cartLabel, 24, D.actions.cartLabel) || D.actions.cartLabel, buyLabel: str(ac.buyLabel, 24, D.actions.buyLabel) || D.actions.buyLabel,
      sticky: bool(ac.sticky, D.actions.sticky),
    },
    related: { title: str(rl.title, 40, D.related.title) || D.related.title, limit: int(rl.limit, 2, 30, D.related.limit), source: rl.source === "latest" ? "latest" : "category" },
    cart: {
      tileButton: bool(ct.tileButton, D.cart.tileButton), tileLabel: str(ct.tileLabel, 20, D.cart.tileLabel) || D.cart.tileLabel,
      stepper: bool(ct.stepper, D.cart.stepper), floatingBar: bool(ct.floatingBar, D.cart.floatingBar),
      barLabel: str(ct.barLabel, 20, D.cart.barLabel) || D.cart.barLabel, barColor: color(ct.barColor, D.cart.barColor),
    },
  };
}

async function read(key: string): Promise<unknown | null> {
  try {
    const row = await prisma.storefrontSetting.findUnique({ where: { key } });
    return row ? row.value : null;
  } catch {
    return null;
  }
}

export function getLiveProductPage(): Promise<ProductPageConfig> {
  return cached("pp:live", ["StorefrontSetting"], 60_000, async () => sanitizeProductPage((await read(LIVE)) ?? DEFAULT_PRODUCT_PAGE));
}

export async function getDraftProductPage(): Promise<ProductPageConfig> {
  return sanitizeProductPage((await read(DRAFT)) ?? (await read(LIVE)) ?? DEFAULT_PRODUCT_PAGE);
}

export async function saveProductPage(input: unknown, publish: boolean): Promise<ProductPageConfig> {
  const clean = sanitizeProductPage(input);
  const value = clean as unknown as object;
  const ops = [prisma.storefrontSetting.upsert({ where: { key: DRAFT }, create: { key: DRAFT, value }, update: { value } })];
  if (publish) ops.push(prisma.storefrontSetting.upsert({ where: { key: LIVE }, create: { key: LIVE, value }, update: { value } }));
  await prisma.$transaction(ops);
  return clean;
}
