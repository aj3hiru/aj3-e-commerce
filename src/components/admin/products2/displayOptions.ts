import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /admin/ecommerce/products2 — same panel and store as
 * dashboard2 / billing2 / sales-history2, with its own localStorage key so
 * nothing hidden here hides anything on another page. A group's checkbox
 * shows/hides the whole section; its items show/hide the parts inside it.
 */
export const PRODUCTS2_PREF_KEY = "ecom_products2_display";

export const PRODUCTS2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "p2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "p2-k-total", label: "Total Products" },
      { key: "p2-k-published", label: "Published" },
      { key: "p2-k-low", label: "Low Stock" },
      { key: "p2-k-out", label: "Out of Stock" },
    ],
  },
  {
    group: "p2-filters",
    groupLabel: "Filters",
    items: [
      { key: "p2-f-status", label: "Status" },
      { key: "p2-f-stock", label: "Stock" },
      { key: "p2-f-category", label: "Category" },
      { key: "p2-f-type", label: "Type" },
      { key: "p2-f-item", label: "Item Type" },
    ],
  },
  {
    group: "p2-table",
    groupLabel: "Products Table",
    items: [
      { key: "p2-c-select", label: "Select & Bulk Actions" },
      { key: "p2-c-image", label: "Image" },
      { key: "p2-c-name", label: "Name" },
      { key: "p2-c-stock", label: "Stock" },
      { key: "p2-c-category", label: "Category" },
      { key: "p2-c-price", label: "Price" },
      { key: "p2-c-status", label: "Status" },
      { key: "p2-c-type", label: "Type" },
      { key: "p2-c-item", label: "Item Type" },
      { key: "p2-c-actions", label: "Actions" },
    ],
  },
];

export const PRODUCTS2_STANDALONE: readonly { key: string; label: string }[] = [];
