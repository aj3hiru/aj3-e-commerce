import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Display Options for /admin/ecommerce/product-reviews2 (own localStorage key). */
export const REVIEWS2_PREF_KEY = "ecom_reviews2_display";

export const REVIEWS2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "rv2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "rv2-k-total", label: "All Reviews" },
      { key: "rv2-k-today", label: "Today" },
      { key: "rv2-k-pending", label: "Pending Reviews" },
      { key: "rv2-k-approved", label: "Approved" },
      { key: "rv2-k-rejected", label: "Rejected" },
      { key: "rv2-k-average", label: "Average Rating" },
      { key: "rv2-k-low", label: "Low Ratings" },
      { key: "rv2-k-range", label: "In Selected Range" },
    ],
  },
  {
    group: "rv2-filters",
    groupLabel: "Filters",
    items: [
      { key: "rv2-f-status", label: "Status" },
      { key: "rv2-f-rating", label: "Rating" },
      { key: "rv2-f-category", label: "Category" },
      { key: "rv2-f-product", label: "Product" },
      { key: "rv2-f-text", label: "Message" },
    ],
  },
  {
    group: "rv2-table",
    groupLabel: "Review Table",
    items: [
      { key: "rv2-c-product", label: "Product" },
      { key: "rv2-c-customer", label: "Name" },
      { key: "rv2-c-rating", label: "Rating" },
      { key: "rv2-c-review", label: "Review" },
      { key: "rv2-c-status", label: "Status" },
      { key: "rv2-c-actions", label: "Actions" },
      { key: "rv2-t-search", label: "Search box" },
    ],
  },
];

export const REVIEWS2_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "rv2-range", label: "Date Range Bar" },
  { key: "rv2-spread", label: "Ratings Breakdown" },
];
