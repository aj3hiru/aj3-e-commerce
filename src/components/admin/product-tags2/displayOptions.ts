import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Display Options for /admin/ecommerce/product-tags2 (own localStorage key). */
export const TAGS2_PREF_KEY = "ecom_product_tags2_display";

export const TAGS2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "tg2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "tg2-k-badges", label: "Badge Tags" },
      { key: "tg2-k-types", label: "Item Types" },
      { key: "tg2-k-active", label: "Active" },
      { key: "tg2-k-unused", label: "Not Used" },
      { key: "tg2-k-tagged", label: "Tagged Products" },
      { key: "tg2-k-units", label: "Units Sold" },
      { key: "tg2-k-revenue", label: "Sales from Badges" },
      { key: "tg2-k-top", label: "Best Performing" },
    ],
  },
  {
    group: "tg2-filters",
    groupLabel: "Filters",
    items: [
      { key: "tg2-f-group", label: "Tag Type" },
      { key: "tg2-f-status", label: "Status" },
      { key: "tg2-f-usage", label: "Usage" },
    ],
  },
  {
    group: "tg2-table",
    groupLabel: "Tag Table",
    items: [
      { key: "tg2-c-tag", label: "Tag" },
      { key: "tg2-c-group", label: "Type" },
      { key: "tg2-c-products", label: "Products" },
      { key: "tg2-c-sales", label: "Units Sold" },
      { key: "tg2-c-revenue", label: "Sales" },
      { key: "tg2-c-status", label: "Status" },
      { key: "tg2-c-actions", label: "Actions" },
      { key: "tg2-t-search", label: "Search box" },
    ],
  },
];

export const TAGS2_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "tg2-range", label: "Date Range Bar" },
  { key: "tg2-orphans", label: "Untagged values notice" },
];
