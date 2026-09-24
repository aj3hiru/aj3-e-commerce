/**
 * Storefront homepage configuration, edited in the Homepage Customizer
 * (/admin/ecommerce/homepage-settings) and rendered by /shop. Plain types,
 * defaults and the Meesho palette — importable from server and browser.
 */

export const MEESHO = {
  jamun: "#9f2089", // buttons, active tab
  promoBg: "#e7eeff",
  stripBg: "#f8f9fe",
  gap: "#eaeaf2", // section gaps and hairlines
  text: "#353543",
  muted: "#8b8ba3",
  mall: "#682bf2",
  rating: "#038d63",
  catBg: "#feeff6",
  catIcon: "#f06ea9",
} as const;

export interface PromoBar {
  enabled: boolean;
  image: string; // uploaded path or https URL; blank → a gift icon
  title: string;
  subtitle: string;
  buttonLabel: string;
  buttonUrl: string;
  bgColor: string;
  buttonColor: string;
  showOn: "home" | "all";
  dismissHours: number; // how long ✕ hides it (0 = until the next visit)
}

export type StripIcon = "pin" | "truck" | "tag" | "gift" | "bolt" | "clock";
export interface InfoStrip { enabled: boolean; icon: StripIcon; text: string; href: string }

export interface BannerSlide { id: string; image: string; href: string }

export type HomeBlock =
  | { id: string; type: "banner"; enabled: boolean; slides: BannerSlide[]; autoplay: number; rounded: boolean }
  | { id: string; type: "categories"; enabled: boolean; source: "all" | "pick"; slugs: string[]; limit: number; showAllButton: boolean }
  | { id: string; type: "products"; enabled: boolean; title: string; source: "latest" | "deals" | "top_rated" | "category" | "manual"; category: string; productIds: number[]; limit: number }
  | { id: string; type: "image"; enabled: boolean; image: string; href: string }
  | { id: string; type: "feed"; enabled: boolean; title: string; showSort: boolean; showCategory: boolean; showBrand: boolean; showFilters: boolean };

export type HomeBlockType = HomeBlock["type"];

export interface CardOptions { showWishlist: boolean; showRating: boolean; showDiscount: boolean; showDealTimer: boolean; showBadge: boolean }

export interface HomeConfig {
  accent: string;
  promo: PromoBar;
  strip: InfoStrip;
  blocks: HomeBlock[];
  card: CardOptions;
  bottomNav: boolean;
}

export const BLOCK_LABEL: Record<HomeBlockType, string> = {
  banner: "Banner slider",
  categories: "Category circles",
  products: "Product row",
  image: "Image banner",
  feed: "Products For You",
};

const rid = () => Math.random().toString(36).slice(2, 10);

export function newBlock(type: HomeBlockType): HomeBlock {
  const id = rid();
  switch (type) {
    case "banner": return { id, type, enabled: true, slides: [], autoplay: 5, rounded: true };
    case "categories": return { id, type, enabled: true, source: "all", slugs: [], limit: 12, showAllButton: true };
    case "products": return { id, type, enabled: true, title: "Deals of the Day", source: "deals", category: "", productIds: [], limit: 10 };
    case "image": return { id, type, enabled: true, image: "", href: "/shop" };
    case "feed": return { id, type, enabled: true, title: "Products For You", showSort: true, showCategory: true, showBrand: true, showFilters: true };
  }
}

export const DEFAULT_HOME: HomeConfig = {
  accent: MEESHO.jamun,
  promo: {
    enabled: true, image: "", title: "Welcome! Discover today's best deals", subtitle: "New arrivals added every day",
    buttonLabel: "Shop Now", buttonUrl: "/shop", bgColor: MEESHO.promoBg, buttonColor: MEESHO.jamun, showOn: "home", dismissHours: 24,
  },
  strip: { enabled: true, icon: "pin", text: "Add your delivery address for a faster checkout", href: "/shop/account" },
  blocks: [
    { id: "b-banner", type: "banner", enabled: true, slides: [], autoplay: 5, rounded: true },
    { id: "b-cats", type: "categories", enabled: true, source: "all", slugs: [], limit: 12, showAllButton: true },
    { id: "b-feed", type: "feed", enabled: true, title: "Products For You", showSort: true, showCategory: true, showBrand: true, showFilters: true },
  ],
  card: { showWishlist: true, showRating: true, showDiscount: true, showDealTimer: true, showBadge: true },
  bottomNav: true,
};
