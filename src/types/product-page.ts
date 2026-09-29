/**
 * Product page configuration, edited in Customizer → Product Page and
 * rendered by /shop/product. Plain types and defaults (Meesho's mobile
 * product page) — importable from server and browser.
 */

export type PPSectionKey =
  | "breadcrumb" | "gallery" | "trust" | "thumbs" | "info" | "sizes" | "soldBy"
  | "highlights" | "reviews" | "assurance" | "actions" | "related";

export const PP_SECTION_LABEL: Record<PPSectionKey, string> = {
  breadcrumb: "Breadcrumb",
  gallery: "Image gallery",
  trust: "Trust strip",
  thumbs: "Photo thumbnails",
  info: "Title, price & rating",
  sizes: "Select size",
  soldBy: "Sold by",
  highlights: "Product highlights",
  reviews: "Ratings & reviews",
  assurance: "Assurance badges",
  actions: "Add to Cart / Buy Now",
  related: "People also viewed",
};

export const PP_SECTION_HINT: Record<PPSectionKey, string> = {
  breadcrumb: "Home / Category / Product links",
  gallery: "Swipeable product photos with dots",
  trust: "Badge + “Original Brands” strip under the photos",
  thumbs: "All photos of the product — tap one to show it above",
  info: "Name, description, price, offer, deal timer, delivery, stock, rating",
  sizes: "Size chips — only for products sold in sizes",
  soldBy: "Your store card with rating and View Shop",
  highlights: "Replaced by the Specifications list under the price (nothing shows here)",
  reviews: "Rating summary, customer reviews and (on computers) products beside them",
  assurance: "Lowest Price · Cash on Delivery · Returns",
  actions: "Add to Cart / Buy Now (Notify me when out of stock)",
  related: "Product grid below the page",
};

/** Sections no longer on the page — kept in saved settings only so old drafts still load. */
export const PP_RETIRED: PPSectionKey[] = ["soldBy", "highlights"];

export type TrustIcon = "check" | "box" | "star" | "shield" | "truck" | "tag" | "award" | "leaf";
export type AssuranceIcon = "price" | "cod" | "returns" | "truck" | "shield" | "support" | "quality" | "gift";

export interface TrustItem { id: string; icon: TrustIcon; label: string }
export interface AssuranceItem { id: string; icon: AssuranceIcon; image: string; label: string }

export interface ProductPageConfig {
  accent: string;
  order: PPSectionKey[];
  hidden: PPSectionKey[];
  gallery: { dots: boolean; zoom: boolean };
  trust: { badge: string; badgeColor: string; bg: string; items: TrustItem[] };
  thumbs: { title: string; showCount: boolean };
  info: {
    showWishlist: boolean; showShare: boolean; showOffer: boolean; showDeal: boolean; showStock: boolean; showRating: boolean;
    deliveryText: string; deliveryStrike: string;
    /** Description under the name (2 lines, then "… See more"). */
    showDescription: boolean;
  };
  sizes: { title: string; showPrice: boolean };
  soldBy: { title: string; name: string; showRating: boolean; showViewShop: boolean; viewShopLabel: string; viewShopUrl: string };
  highlights: {
    title: string; showCopy: boolean; showBrand: boolean; showCategory: boolean; showUnit: boolean; showSku: boolean;
    detailsTitle: string; detailsOpen: boolean;
  };
  /** allowWrite: customers who bought the product can review it (one review per purchase). side*: computer screens only — products beside the reviews. */
  reviews: { title: string; showBars: boolean; perPage: number; allowWrite: boolean; side: boolean; sideTitle: string; sideSource: "trending" | "latest" };
  assurance: { bg: string; items: AssuranceItem[] };
  actions: { showCart: boolean; showBuy: boolean; cartLabel: string; buyLabel: string; sticky: boolean };
  related: { title: string; limit: number; source: "category" | "latest" };
  /** Add-to-cart on product cards, the − / + stepper, and the floating View Cart bar (whole store). */
  cart: {
    tileButton: boolean; tileLabel: string; stepper: boolean; floatingBar: boolean; barLabel: string; barColor: string;
    /** "Only a few left — order soon" under the price on product cards. */
    tileLowStock: boolean;
    /** Wording of that line (product cards and the product page). */
    lowStockText: string;
    /** Out-of-stock products: a "Notify me" button (cards and product page) that sends a notification when it is back. */
    notify: boolean; notifyLabel: string;
  };
}

export const PP_DEFAULT_ORDER: PPSectionKey[] = [
  "breadcrumb", "gallery", "trust", "thumbs", "info", "sizes", "soldBy", "highlights", "reviews", "assurance", "actions", "related",
];

export const TRUST_ICONS: TrustIcon[] = ["check", "box", "star", "shield", "truck", "tag", "award", "leaf"];
export const ASSURANCE_ICONS: AssuranceIcon[] = ["price", "cod", "returns", "truck", "shield", "support", "quality", "gift"];

export const DEFAULT_PRODUCT_PAGE: ProductPageConfig = {
  accent: "#9f2089",
  order: PP_DEFAULT_ORDER,
  hidden: [],
  gallery: { dots: true, zoom: true },
  trust: {
    badge: "Assured", badgeColor: "#682bf2", bg: "#e8e0fd",
    items: [
      { id: "t1", icon: "box", label: "Original Brands" },
      { id: "t2", icon: "star", label: "Direct From Store" },
    ],
  },
  thumbs: { title: "Product Photos", showCount: true },
  info: {
    showWishlist: true, showShare: true, showOffer: false, showDeal: true, showStock: true, showRating: true,
    deliveryText: "Free Delivery", deliveryStrike: "", showDescription: true,
  },
  sizes: { title: "Select Size", showPrice: true },
  soldBy: { title: "Sold By", name: "", showRating: true, showViewShop: true, viewShopLabel: "View Shop", viewShopUrl: "/" },
  highlights: {
    title: "Product Highlights", showCopy: true, showBrand: true, showCategory: true, showUnit: true, showSku: false,
    detailsTitle: "Additional Details", detailsOpen: false,
  },
  reviews: { title: "Product Ratings & Reviews", showBars: true, perPage: 3, allowWrite: true, side: true, sideTitle: "Trending now", sideSource: "trending" },
  assurance: {
    bg: "#e7eeff",
    items: [
      { id: "a1", icon: "price", image: "", label: "Lowest Price" },
      { id: "a2", icon: "cod", image: "", label: "Cash on Delivery" },
      { id: "a3", icon: "returns", image: "", label: "7-day Returns" },
    ],
  },
  actions: { showCart: true, showBuy: true, cartLabel: "Add to Cart", buyLabel: "Buy Now", sticky: true },
  related: { title: "People also viewed", limit: 10, source: "category" },
  cart: { tileButton: true, tileLabel: "Add to Cart", stepper: true, floatingBar: true, barLabel: "View Cart", barColor: "#9f2089",
    tileLowStock: true, lowStockText: "Only a few left — order soon", notify: true, notifyLabel: "Notify me" },
};

export type CartUi = ProductPageConfig["cart"];
