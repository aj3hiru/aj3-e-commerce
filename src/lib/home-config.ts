import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { isSafeHref } from "@/types/storefront";
import {
  DEFAULT_HOME, MEESHO,
  type BannerSlide, type CardOptions, type HomeBlock, type HomeConfig, type InfoStrip, type PromoBar, type StripIcon,
} from "@/types/home";

/**
 * Homepage Customizer storage (storefront_settings keys "home" = live,
 * "homeDraft" = what the customizer is editing). Everything read or written
 * goes through sanitizeHome(), so a bad value can never break the storefront.
 */

const LIVE = "home";
const DRAFT = "homeDraft";

const str = (v: unknown, max: number, fb = "") => (typeof v === "string" ? v.trim().slice(0, max) : fb);
const bool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);
const color = (v: unknown, fb: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : fb);
const int = (v: unknown, min: number, max: number, fb: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb; };
const href = (v: unknown, fb = "") => { const h = str(v, 300); return h && isSafeHref(h) ? h : fb; };
const id = (v: unknown) => str(v, 40).replace(/[^\w-]/g, "") || Math.random().toString(36).slice(2, 10);
/** Images: our own uploads (uploads/…) or an https URL. */
const image = (v: unknown) => { const s = str(v, 400); return /^uploads\/[\w./-]+\.(jpe?g|png|gif|webp)$/i.test(s) && !s.includes("..") ? s : /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : ""; };

function promo(v: unknown): PromoBar {
  const r = (v ?? {}) as Record<string, unknown>, d = DEFAULT_HOME.promo;
  return {
    enabled: bool(r.enabled, d.enabled), image: image(r.image), title: str(r.title, 80, d.title), subtitle: str(r.subtitle, 100),
    buttonLabel: str(r.buttonLabel, 24), buttonUrl: href(r.buttonUrl), bgColor: color(r.bgColor, d.bgColor), buttonColor: color(r.buttonColor, d.buttonColor),
    showOn: r.showOn === "all" ? "all" : "home", dismissHours: int(r.dismissHours, 0, 720, d.dismissHours),
  };
}

function strip(v: unknown): InfoStrip {
  const r = (v ?? {}) as Record<string, unknown>, d = DEFAULT_HOME.strip;
  const icons: StripIcon[] = ["pin", "truck", "tag", "gift", "bolt", "clock"];
  return { enabled: bool(r.enabled, d.enabled), icon: icons.includes(r.icon as StripIcon) ? (r.icon as StripIcon) : "pin", text: str(r.text, 90, d.text), href: href(r.href) };
}

function block(v: unknown): HomeBlock | null {
  const r = (v ?? {}) as Record<string, unknown>;
  const base = { id: id(r.id), enabled: bool(r.enabled, true) };
  switch (r.type) {
    case "banner": {
      const slides: BannerSlide[] = Array.isArray(r.slides) ? r.slides.slice(0, 10).flatMap((s) => {
        const ss = (s ?? {}) as Record<string, unknown>; const img = image(ss.image);
        return img ? [{ id: id(ss.id), image: img, href: href(ss.href) }] : [];
      }) : [];
      return { ...base, type: "banner", slides, autoplay: int(r.autoplay, 0, 30, 5), rounded: bool(r.rounded, true) };
    }
    case "categories":
      return { ...base, type: "categories", source: r.source === "pick" ? "pick" : "all",
        slugs: Array.isArray(r.slugs) ? r.slugs.slice(0, 30).map((x) => str(x, 120)).filter(Boolean) : [], limit: int(r.limit, 1, 30, 12), showAllButton: bool(r.showAllButton, true) };
    case "products": {
      const sources = ["latest", "deals", "top_rated", "category", "manual"] as const;
      return { ...base, type: "products", title: str(r.title, 60), source: sources.includes(r.source as never) ? (r.source as (typeof sources)[number]) : "latest",
        category: str(r.category, 120), productIds: Array.isArray(r.productIds) ? r.productIds.slice(0, 30).map(Number).filter((n) => Number.isInteger(n) && n > 0) : [],
        limit: int(r.limit, 1, 30, 10) };
    }
    case "image": { const img = image(r.image); return { ...base, type: "image", image: img, href: href(r.href) }; }
    case "feed":
      return { ...base, type: "feed", title: str(r.title, 60, "Products For You") || "Products For You", showSort: bool(r.showSort, true),
        showCategory: bool(r.showCategory, true), showBrand: bool(r.showBrand, true), showFilters: bool(r.showFilters, true) };
    default: return null;
  }
}

function card(v: unknown): CardOptions {
  const r = (v ?? {}) as Record<string, unknown>, d = DEFAULT_HOME.card;
  return { showWishlist: bool(r.showWishlist, d.showWishlist), showRating: bool(r.showRating, d.showRating), showDiscount: bool(r.showDiscount, d.showDiscount),
    showDealTimer: bool(r.showDealTimer, d.showDealTimer), showBadge: bool(r.showBadge, d.showBadge), gap: bool(r.gap, d.gap) };
}

export function sanitizeHome(input: unknown): HomeConfig {
  if (!input || typeof input !== "object") return DEFAULT_HOME;
  const r = input as Record<string, unknown>;
  let blocks = Array.isArray(r.blocks) ? r.blocks.slice(0, 20).map(block).filter((b): b is HomeBlock => !!b) : DEFAULT_HOME.blocks;
  // Only one "Products For You" feed makes sense on a page.
  let seenFeed = false;
  blocks = blocks.filter((b) => (b.type === "feed" ? (seenFeed ? false : (seenFeed = true)) : true));
  return { accent: color(r.accent, MEESHO.jamun), promo: promo(r.promo), strip: strip(r.strip), blocks, card: card(r.card), bottomNav: bool(r.bottomNav, true) };
}

async function read(key: string): Promise<unknown | null> {
  try {
    const row = await prisma.storefrontSetting.findUnique({ where: { key } });
    return row ? row.value : null;
  } catch {
    return null;
  }
}

/** What shoppers see. */
export function getLiveHome(): Promise<HomeConfig> {
  return cached("home:live", ["StorefrontSetting"], 60_000, async () => sanitizeHome((await read(LIVE)) ?? DEFAULT_HOME));
}

/** What the customizer is editing (falls back to the live homepage). */
export async function getDraftHome(): Promise<HomeConfig> {
  return sanitizeHome((await read(DRAFT)) ?? (await read(LIVE)) ?? DEFAULT_HOME);
}

export async function saveHome(input: unknown, publish: boolean): Promise<HomeConfig> {
  const clean = sanitizeHome(input);
  const value = clean as unknown as object;
  const ops = [prisma.storefrontSetting.upsert({ where: { key: DRAFT }, create: { key: DRAFT, value }, update: { value } })];
  if (publish) ops.push(prisma.storefrontSetting.upsert({ where: { key: LIVE }, create: { key: LIVE, value }, update: { value } }));
  await prisma.$transaction(ops);
  return clean;
}

/** Whether the draft differs from what's live (for the "Unpublished changes" badge). */
export async function hasUnpublished(): Promise<boolean> {
  const [d, l] = await Promise.all([read(DRAFT), read(LIVE)]);
  if (!d) return false;
  return JSON.stringify(sanitizeHome(d)) !== JSON.stringify(sanitizeHome(l ?? DEFAULT_HOME));
}
