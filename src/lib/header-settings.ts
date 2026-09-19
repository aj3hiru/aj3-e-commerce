import { prisma } from "./db";
import type { ShopHeaderSettings } from "@/types/shop";

/**
 * The five `ecom_home_settings` keys that drive the storefront header strip.
 * Names are copied verbatim from shop-header.php so the PHP and the Next.js
 * app read and write the same rows.
 */
export const HEADER_SETTING_KEYS = [
  "show_location",
  "show_delivery_info",
  "delivery_label",
  "delivery_time_text",
  "search_placeholder",
] as const;

export type HeaderSettingKey = (typeof HEADER_SETTING_KEYS)[number];

/** Defaults are the `?? '…'` fallbacks in shop-header.php lines 40-47. */
export const HEADER_SETTING_DEFAULTS: Record<HeaderSettingKey, string> = {
  show_location: "1",
  show_delivery_info: "1",
  delivery_label: "We're open",
  delivery_time_text: "",
  search_placeholder: "Search for products",
};

/**
 * Reads the header strip settings.
 *
 * `businessHours` is the documented fallback for the delivery-time text: the
 * PHP only uses ecom_business_settings.business_hours when the customizer field
 * is left blank, and the storefront hides the whole block when both are empty.
 *
 * Wrapped in try/catch for the same reason the PHP is: on a database that has
 * not had the customizer migration applied yet, the table simply doesn't exist,
 * and a missing settings table must not take the whole storefront down.
 */
export async function getShopHeaderSettings(businessHours?: string | null): Promise<ShopHeaderSettings> {
  let rows: { settingKey: string; settingValue: string }[] = [];
  try {
    rows = await prisma.ecomHomeSetting.findMany({
      where: { settingKey: { in: [...HEADER_SETTING_KEYS] } },
      select: { settingKey: true, settingValue: true },
    });
  } catch {
    rows = [];
  }

  const map = new Map(rows.map((r: { settingKey: string; settingValue: string }) => [r.settingKey, r.settingValue]));
  const get = (key: HeaderSettingKey) => map.get(key) ?? HEADER_SETTING_DEFAULTS[key];

  const configuredTime = get("delivery_time_text").trim();

  return {
    // PHP compares against the string '1', so anything else (including '0' and
    // an absent row that defaulted to '1') follows the same rule here.
    showLocation: get("show_location") === "1",
    showDeliveryInfo: get("show_delivery_info") === "1",
    deliveryLabel: get("delivery_label"),
    deliveryTimeText: configuredTime !== "" ? configuredTime : (businessHours ?? "").trim(),
    searchPlaceholder: get("search_placeholder"),
  };
}
