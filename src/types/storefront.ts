/**
 * Storefront configuration edited from Business Settings → Header Menu /
 * Sidebar Menu / Menu Design / Push Notifications / Footer, and read by the
 * shop header, mobile sidebar and footer. Plain types + defaults only, so both
 * the server and the browser can import this file.
 */

export type MenuVisibility = "all" | "guest" | "user";

export const MENU_ICONS = [
  "home", "grid", "cart", "heart", "user", "package", "truck", "tag", "percent", "gift", "star",
  "store", "phone", "mail", "map", "info", "help", "file", "link",
] as const;
export type MenuIcon = (typeof MENU_ICONS)[number];

export interface MenuChild { id: string; label: string; href: string }

export interface MenuItem {
  id: string;
  label: string;
  href: string;
  icon: MenuIcon;
  visibility: MenuVisibility; // everyone / only logged-out / only logged-in shoppers
  enabled: boolean;
  newTab: boolean;
  /** Dropdown that lists every active category automatically. */
  autoCategories: boolean;
  children: MenuChild[];
}

export interface MenuDesign {
  accent: string; // highlight colour for active/hover rows and dropdown headers
  showIcons: boolean;
  dividers: boolean;
}

export interface PushUiConfig {
  showBell: boolean; // bell in header + sidebar while not subscribed
  autoPrompt: boolean; // ask on first visit (Chrome/Edge) / first tap (Firefox/Safari)
}

export interface FooterLink { id: string; label: string; href: string }
export interface FooterColumn { id: string; title: string; links: FooterLink[] }

export interface FooterConfig {
  description: string; // blank → the business tagline
  bgColor: string;
  accentColor: string;
  columns: FooterColumn[];
  showContactColumn: boolean;
  contactTitle: string;
  ctaEnabled: boolean;
  ctaTitle: string;
  ctaSubtitle: string;
  ctaButtonLabel: string;
  ctaButtonUrl: string; // blank → the WhatsApp link from Social Media, or the first contact number
  ctaButtonColor: string;
  copyright: string; // {year} and {name} are replaced
}

export interface StorefrontConfig {
  headerMenu: MenuItem[];
  sidebarMenu: MenuItem[];
  menuDesign: MenuDesign;
  push: PushUiConfig;
  footer: FooterConfig;
}

const item = (id: string, label: string, href: string, icon: MenuIcon, extra: Partial<MenuItem> = {}): MenuItem => ({
  id, label, href, icon, visibility: "all", enabled: true, newTab: false, autoCategories: false, children: [], ...extra,
});

export const DEFAULT_HEADER_MENU: MenuItem[] = [
  item("h-home", "Home", "/shop", "home"),
  item("h-cats", "All Categories", "/shop#categories", "grid", { autoCategories: true }),
  item("h-wish", "Wishlist", "/shop/wishlist", "heart"),
  item("h-orders", "My Orders", "/shop/account#orders", "package", { visibility: "user" }),
  item("h-track", "Track Order", "/shop/order", "truck"),
];

export const DEFAULT_SIDEBAR_MENU: MenuItem[] = [
  item("s-home", "Home", "/shop", "home"),
  item("s-cats", "All Categories", "/shop#categories", "grid", { autoCategories: true }),
  item("s-cart", "My Cart", "/shop/cart", "cart"),
  item("s-wish", "Wishlist", "/shop/wishlist", "heart"),
  item("s-orders", "My Orders", "/shop/account#orders", "package", { visibility: "user" }),
  item("s-account", "My Account", "/shop/account", "user", { visibility: "user" }),
  item("s-track", "Track Order", "/shop/order", "truck"),
];

export const DEFAULT_MENU_DESIGN: MenuDesign = { accent: "#9f2089", showIcons: true, dividers: true }; // Meesho jamun

export const DEFAULT_PUSH_UI: PushUiConfig = { showBell: true, autoPrompt: true };

export const DEFAULT_FOOTER: FooterConfig = {
  description: "",
  bgColor: "#9f2089", // Meesho jamun — same as Buy Now and the floating cart bar
  accentColor: "#ffc2e8",
  columns: [{
    id: "f-quick", title: "Quick Links",
    links: [
      { id: "f-1", label: "Home", href: "/shop" },
      { id: "f-2", label: "All Categories", href: "/shop#categories" },
      { id: "f-3", label: "My Cart", href: "/shop/cart" },
      { id: "f-4", label: "My Account", href: "/shop/account" },
      { id: "f-5", label: "Track Order", href: "/shop/order" },
    ],
  }],
  showContactColumn: true,
  contactTitle: "Get in Touch",
  ctaEnabled: true,
  ctaTitle: "Follow Us On Social Media",
  ctaSubtitle: "Get Latest Update On Social Media",
  ctaButtonLabel: "Join Now",
  ctaButtonUrl: "",
  ctaButtonColor: "#25bd41",
  copyright: "© {year} {name}. All rights reserved.",
};

export const DEFAULT_STOREFRONT: StorefrontConfig = {
  headerMenu: DEFAULT_HEADER_MENU,
  sidebarMenu: DEFAULT_SIDEBAR_MENU,
  menuDesign: DEFAULT_MENU_DESIGN,
  push: DEFAULT_PUSH_UI,
  footer: DEFAULT_FOOTER,
};

/** Ready-made link targets for the menu/footer builders. */
export const LINK_PRESETS: { label: string; href: string; icon: MenuIcon }[] = [
  { label: "Home", href: "/shop", icon: "home" },
  { label: "All Categories", href: "/shop#categories", icon: "grid" },
  { label: "My Cart", href: "/shop/cart", icon: "cart" },
  { label: "Wishlist", href: "/shop/wishlist", icon: "heart" },
  { label: "My Account", href: "/shop/account", icon: "user" },
  { label: "My Orders", href: "/shop/account#orders", icon: "package" },
  { label: "Track Order", href: "/shop/order", icon: "truck" },
  { label: "Login", href: "/shop/login", icon: "user" },
  { label: "Sign up", href: "/shop/register", icon: "user" },
];

/** Links allowed in menus/footer: site paths, http(s), tel:, mailto:, or an in-page #anchor. */
export function isSafeHref(href: string): boolean {
  const h = href.trim();
  return /^\/(?!\/)/.test(h) || /^#[\w-]*$/.test(h) || /^https?:\/\/[^\s]+$/i.test(h) || /^tel:\+?[\d\s()-]{3,20}$/i.test(h) || /^mailto:[^\s@]+@[^\s@]+$/i.test(h);
}
