import type { AuthSettings } from "@/types/auth-settings";
import type { ShopBusinessSettings, ShopHeaderSettings } from "@/types/shop";
import type { StorefrontConfig } from "@/types/storefront";

/**
 * What an admin screen sends into the preview frame on every edit. Anything
 * left out falls back to the saved store.
 *   view "store" — header, menus, sidebar and footer around a sample homepage
 *   view "login" — the customer login page (OTP or password)
 *   view "page"  — a static page (About us, Privacy…) being written
 */
export interface StorePreviewState {
  view?: "store" | "login" | "page";
  business?: ShopBusinessSettings;
  header?: ShopHeaderSettings;
  storefront?: StorefrontConfig;
  auth?: AuthSettings;
  page?: { title: string; content: string };
  loggedIn: boolean;
  /** Open the mobile sidebar (Sidebar Menu / Menu Design). */
  drawer?: boolean;
  /** Where to scroll: the footer for footer-related settings, else the top. */
  focus?: "top" | "footer";
}

export const PREVIEW_MSG = "bs-store-preview";

/** Inside every preview frame: no scrollbar strip on the right of the phone / laptop screen. */
export const HIDE_SCROLLBARS = "html,body{scrollbar-width:none;overflow-x:hidden}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none;width:0;height:0}";
