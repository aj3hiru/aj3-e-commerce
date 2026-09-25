import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import {
  DEFAULT_STOREFRONT, MENU_ICONS, isSafeHref,
  type FooterConfig, type MenuDesign, type MenuItem, type MenuIcon, type MenuVisibility, type PushUiConfig, type StorefrontConfig,
} from "@/types/storefront";

/**
 * Loads/saves the storefront configuration (storefront_settings table, one
 * JSON document per section). Everything read back is re-sanitized, so a bad
 * row can never break the shop — it just falls back to defaults.
 */

const KEYS = ["headerMenu", "sidebarMenu", "menuDesign", "push", "footer"] as const;
type Key = (typeof KEYS)[number];

const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.trim().slice(0, max) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const color = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : fallback);
const href = (v: unknown) => { const h = str(v, 300); return h && isSafeHref(h) ? h : ""; };
const id = (v: unknown) => { const s = str(v, 40).replace(/[^\w-]/g, ""); return s || Math.random().toString(36).slice(2, 10); };

function menu(v: unknown, fallback: MenuItem[]): MenuItem[] {
  if (!Array.isArray(v)) return fallback;
  return v.slice(0, 20).flatMap((raw): MenuItem[] => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const label = str(r.label, 40);
    const autoCategories = bool(r.autoCategories, false);
    const link = href(r.href) || (autoCategories ? "/#categories" : "");
    if (!label || !link) return [];
    const children = Array.isArray(r.children) ? r.children.slice(0, 20).flatMap((c) => {
      const cc = (c ?? {}) as Record<string, unknown>;
      const l = str(cc.label, 40), h = href(cc.href);
      return l && h ? [{ id: id(cc.id), label: l, href: h }] : [];
    }) : [];
    return [{
      id: id(r.id), label, href: link,
      icon: (MENU_ICONS as readonly string[]).includes(r.icon as string) ? (r.icon as MenuIcon) : "link",
      visibility: (["all", "guest", "user"] as const).includes(r.visibility as MenuVisibility) ? (r.visibility as MenuVisibility) : "all",
      enabled: bool(r.enabled, true), newTab: bool(r.newTab, false), autoCategories, children,
    }];
  });
}

function design(v: unknown): MenuDesign {
  const r = (v ?? {}) as Record<string, unknown>, d = DEFAULT_STOREFRONT.menuDesign;
  return { accent: color(r.accent, d.accent), showIcons: bool(r.showIcons, d.showIcons), dividers: bool(r.dividers, d.dividers) };
}

function push(v: unknown): PushUiConfig {
  const r = (v ?? {}) as Record<string, unknown>, d = DEFAULT_STOREFRONT.push;
  return { showBell: bool(r.showBell, d.showBell), autoPrompt: bool(r.autoPrompt, d.autoPrompt) };
}

function footer(v: unknown): FooterConfig {
  const r = (v ?? {}) as Record<string, unknown>, d = DEFAULT_STOREFRONT.footer;
  const columns = Array.isArray(r.columns) ? r.columns.slice(0, 4).flatMap((raw) => {
    const c = (raw ?? {}) as Record<string, unknown>;
    const title = str(c.title, 40);
    const links = Array.isArray(c.links) ? c.links.slice(0, 12).flatMap((l) => {
      const ll = (l ?? {}) as Record<string, unknown>;
      const label = str(ll.label, 40), h = href(ll.href);
      return label && h ? [{ id: id(ll.id), label, href: h }] : [];
    }) : [];
    return title || links.length ? [{ id: id(c.id), title, links }] : [];
  }) : d.columns;
  return {
    description: str(r.description, 400),
    bgColor: color(r.bgColor, d.bgColor),
    accentColor: color(r.accentColor, d.accentColor),
    columns,
    showContactColumn: bool(r.showContactColumn, d.showContactColumn),
    contactTitle: str(r.contactTitle, 40, d.contactTitle) || d.contactTitle,
    ctaEnabled: bool(r.ctaEnabled, d.ctaEnabled),
    ctaTitle: str(r.ctaTitle, 60, d.ctaTitle),
    ctaSubtitle: str(r.ctaSubtitle, 80, d.ctaSubtitle),
    ctaButtonLabel: str(r.ctaButtonLabel, 30, d.ctaButtonLabel),
    ctaButtonUrl: href(r.ctaButtonUrl),
    ctaButtonColor: color(r.ctaButtonColor, d.ctaButtonColor),
    copyright: str(r.copyright, 160, d.copyright) || d.copyright,
  };
}

/** Cleans any input (saved row or admin POST) into a valid config. */
export function sanitizeStorefront(input: Partial<Record<Key, unknown>>): StorefrontConfig {
  const d = DEFAULT_STOREFRONT;
  return {
    headerMenu: input.headerMenu === undefined ? d.headerMenu : menu(input.headerMenu, d.headerMenu),
    sidebarMenu: input.sidebarMenu === undefined ? d.sidebarMenu : menu(input.sidebarMenu, d.sidebarMenu),
    menuDesign: design(input.menuDesign),
    push: push(input.push),
    footer: input.footer === undefined ? d.footer : footer(input.footer),
  };
}

export function getStorefrontConfig(): Promise<StorefrontConfig> {
  return cached("storefront", ["StorefrontSetting"], 60_000, loadStorefrontConfig);
}

async function loadStorefrontConfig(): Promise<StorefrontConfig> {
  try {
    const rows = (await prisma.storefrontSetting.findMany({ where: { key: { in: [...KEYS] } } })) as { key: string; value: unknown }[];
    return sanitizeStorefront(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  } catch {
    return DEFAULT_STOREFRONT; // table missing / DB hiccup — the shop still renders
  }
}

export async function saveStorefrontConfig(input: Partial<Record<Key, unknown>>): Promise<StorefrontConfig> {
  const clean = sanitizeStorefront(input);
  await prisma.$transaction(KEYS.map((key) =>
    prisma.storefrontSetting.upsert({ where: { key }, create: { key, value: clean[key] as object }, update: { value: clean[key] as object } })));
  return clean;
}
