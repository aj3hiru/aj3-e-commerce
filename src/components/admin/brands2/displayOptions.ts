import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /admin/ecommerce/brands2 — same panel and store as the
 * other "2" pages, with its own localStorage key.
 */
export const BRANDS2_PREF_KEY = "ecom_brands2_display";

export const BRANDS2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "b2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "b2-k-total", label: "Total Brands" },
      { key: "b2-k-enabled", label: "Enabled" },
      { key: "b2-k-popular", label: "Popular" },
      { key: "b2-k-unused", label: "No Products" },
    ],
  },
  {
    group: "b2-filters",
    groupLabel: "Filters",
    items: [
      { key: "b2-f-status", label: "Status" },
      { key: "b2-f-popular", label: "Popular" },
      { key: "b2-f-logo", label: "Logo" },
      { key: "b2-f-products", label: "Products" },
    ],
  },
  {
    group: "b2-table",
    groupLabel: "Brands Table",
    items: [
      { key: "b2-c-select", label: "Select & Bulk Actions" },
      { key: "b2-c-name", label: "Name" },
      { key: "b2-c-logo", label: "Logo" },
      { key: "b2-c-slug", label: "Slug" },
      { key: "b2-c-products", label: "Products" },
      { key: "b2-c-status", label: "Status" },
      { key: "b2-c-popular", label: "Popular" },
      { key: "b2-c-actions", label: "Actions" },
      { key: "b2-t-search", label: "Table Search box" },
    ],
  },
];

export const BRANDS2_STANDALONE: readonly { key: string; label: string }[] = [];
