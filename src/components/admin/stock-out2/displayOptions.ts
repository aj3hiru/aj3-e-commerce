import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /admin/ecommerce/stock-out-products — same panel and
 * store as the other "2" pages, with its own localStorage key so hiding
 * something here never hides anything on another page.
 */
export const STOCKOUT2_PREF_KEY = "ecom_stock_out2_display";

export const STOCKOUT2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "so2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "so2-k-total", label: "Out of Stock" },
      { key: "so2-k-active", label: "Active (Live in Shop)" },
      { key: "so2-k-inactive", label: "Inactive" },
      { key: "so2-k-units", label: "With Units" },
    ],
  },
  {
    group: "so2-filters",
    groupLabel: "Filters",
    items: [
      { key: "so2-f-status", label: "Status" },
      { key: "so2-f-category", label: "Category" },
      { key: "so2-f-units", label: "Units" },
      { key: "so2-f-stock", label: "Stock" },
    ],
  },
  {
    group: "so2-table",
    groupLabel: "Stock Out Table",
    items: [
      { key: "so2-c-select", label: "Select & Bulk Actions" },
      { key: "so2-c-image", label: "Image" },
      { key: "so2-c-name", label: "Name" },
      { key: "so2-c-category", label: "Category" },
      { key: "so2-c-price", label: "Price" },
      { key: "so2-c-status", label: "Status" },
      { key: "so2-c-stock", label: "Stock" },
      { key: "so2-c-actions", label: "Actions" },
      { key: "so2-t-search", label: "Table Search box" },
    ],
  },
];

export const STOCKOUT2_STANDALONE: readonly { key: string; label: string }[] = [];
