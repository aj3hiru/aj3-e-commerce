import type { ShopBusinessSettings, ShopHeaderSettings } from "@/types/shop";
import type { StorefrontConfig } from "@/types/storefront";

/** What Business Settings sends into the preview frame on every edit. */
export interface StorePreviewState {
  business: ShopBusinessSettings;
  header: ShopHeaderSettings;
  storefront: StorefrontConfig;
  loggedIn: boolean;
  /** Open the mobile sidebar (Sidebar Menu / Menu Design). */
  drawer: boolean;
  /** Where to scroll: the footer for Footer settings, else the top. */
  focus: "top" | "footer";
}

export const PREVIEW_MSG = "bs-store-preview";
