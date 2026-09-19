import type { ShopHeaderSettings } from "@/types/shop";

/**
 * Client-safe defaults for the storefront header strip — the same `?? '…'`
 * fallbacks shop-header.php applies when a customizer row is missing.
 *
 * This lives apart from `header-settings.ts` because that module imports
 * Prisma; the pages that render a header without hitting the settings table
 * (login, register, the DB-free demo route) need the shape without the
 * database dependency.
 */
export function defaultShopHeaderSettings(businessHours?: string | null): ShopHeaderSettings {
  return {
    showLocation: true,
    showDeliveryInfo: true,
    deliveryLabel: "We're open",
    deliveryTimeText: (businessHours ?? "").trim(),
    searchPlaceholder: "Search for products",
  };
}
