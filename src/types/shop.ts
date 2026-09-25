export interface ShopBusinessSettings {
  businessName: string;
  logo?: string | null;
  location?: string | null;
  businessHours?: string | null;
  tagline?: string | null;
  email?: string | null;
  address?: string | null;
  returnPolicy?: string | null;
  contactNumbers?: string[];
  socialMedia?: { platform: SocialPlatform; url: string }[];
  /** Logo & Branding: what the store header shows, and the logo's width (px). */
  headerDisplay?: "logo" | "name" | "both";
  logoWidth?: number;
}

/**
 * Storefront header strip configuration.
 *
 * In the PHP these five values live in `ecom_home_settings` (read at the top of
 * shop-header.php as $shop_show_location / $shop_show_delivery_info /
 * $shop_delivery_label / $shop_delivery_time_text / $shop_search_placeholder).
 * The storage stays exactly where PHP put it; only the *editor* for them moved
 * into Business Settings, which is what the store owner asked for. Keeping the
 * keys in ecom_home_settings means an existing database needs no migration and
 * the header keeps rendering off the same rows it always did.
 */
export interface ShopHeaderSettings {
  showLocation: boolean;
  showDeliveryInfo: boolean;
  deliveryLabel: string;
  /** Falls back to business_hours when blank — same precedence as the PHP. */
  deliveryTimeText: string;
  searchPlaceholder: string;
}

export type SocialPlatform = "facebook" | "instagram" | "youtube" | "x" | "linkedin" | "whatsapp" | "pinterest";

export interface ShopCategoryNavItem {
  slug: string;
  name: string;
}

export interface ShopCustomer {
  id: number;
  name: string;
}
