import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Display Options for Business Settings (also read by its Payment / GST / Login tabs for the menu). */
export const BS_PREF_KEY = "ecom_business_settings_display";

export const BS_MENU_KEYS: [string, string][] = [
  ["identity", "Business Identity"], ["contact", "Contact Information"], ["branding", "Logo & Branding"], ["social", "Social Media"],
  ["tax", "Tax & Legal"], ["invoice", "Invoice Settings"], ["pos", "POS Shortcuts"], ["orders", "Barcode & Orders"],
  ["payment", "Payment Methods"], ["gst", "GST / Tax Rates"], ["login", "Login & OTP"],
];

export const BS_GROUPS: readonly WidgetGroup[] = [
  { group: "bs-menu", groupLabel: "Menu Sections", items: BS_MENU_KEYS.map(([k, label]) => ({ key: `bs-m-${k}`, label })) },
  {
    group: "bs-preview",
    groupLabel: "Live Preview",
    items: [
      { key: "bs-p-device", label: "Mobile / Desktop switch" },
      { key: "bs-p-audience", label: "Guest / Logged-in switch" },
    ],
  },
];

export const BS_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "bs-savenote", label: "Note beside the Save button" },
];

/** Menu keys hidden in Display Options — read straight from this browser (usable outside the provider). */
export function hiddenBsSections(): Set<string> {
  try {
    const p = JSON.parse(window.localStorage.getItem(BS_PREF_KEY) || "{}") as Record<string, boolean>;
    if (p["bs-menu"] === false) return new Set();
    return new Set(BS_MENU_KEYS.map(([k]) => k).filter((k) => p[`bs-m-${k}`] === false));
  } catch { return new Set(); }
}
