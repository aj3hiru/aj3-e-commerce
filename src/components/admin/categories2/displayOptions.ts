import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /admin/ecommerce/categories2 — same panel and store as
 * the other "2" pages, with its own localStorage key.
 */
export const CATEGORIES2_PREF_KEY = "ecom_categories2_display";

export const CATEGORIES2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "c2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "c2-k-total", label: "Total Categories" },
      { key: "c2-k-active", label: "Active Categories" },
      { key: "c2-k-inactive", label: "Inactive Categories" },
      { key: "c2-k-products", label: "Products Assigned" },
    ],
  },
  {
    group: "c2-filters",
    groupLabel: "Filters",
    items: [
      { key: "c2-f-status", label: "Status" },
      { key: "c2-f-sort", label: "Sort" },
    ],
  },
  {
    group: "c2-table",
    groupLabel: "Categories Table",
    items: [
      { key: "c2-c-select", label: "Select & Bulk Actions" },
      { key: "c2-c-image", label: "Image" },
      { key: "c2-c-name", label: "Category Name" },
      { key: "c2-c-slug", label: "Slug" },
      { key: "c2-c-products", label: "Products" },
      { key: "c2-c-serial", label: "Serial" },
      { key: "c2-c-status", label: "Status" },
      { key: "c2-c-updated", label: "Last Updated" },
      { key: "c2-c-actions", label: "Actions" },
      { key: "c2-t-search", label: "Table Search box" },
    ],
  },
];

export const CATEGORIES2_STANDALONE: readonly { key: string; label: string }[] = [];
