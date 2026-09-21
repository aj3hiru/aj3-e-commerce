import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /admin/ecommerce/due2 — same panel and store as the
 * other "2" pages, with its own localStorage key so hiding something here
 * never hides anything on another page.
 */
export const DUE2_PREF_KEY = "ecom_due2_display";

export const DUE2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "due2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "due2-k-total", label: "Total Due" },
      { key: "due2-k-overdue", label: "Overdue" },
      { key: "due2-k-today", label: "Due Today" },
      { key: "due2-k-people", label: "People with Dues" },
      { key: "due2-k-newtoday", label: "Today's New Due" },
      { key: "due2-k-collected", label: "Today's Collection" },
      { key: "due2-k-range", label: "Collected in Range" },
      { key: "due2-k-nodate", label: "No Promise Date" },
    ],
  },
  {
    group: "due2-filters",
    groupLabel: "Filters",
    items: [
      { key: "due2-f-status", label: "Status" },
      { key: "due2-f-promise", label: "Promise Date" },
      { key: "due2-f-source", label: "Order Source" },
      { key: "due2-f-product", label: "Product" },
      { key: "due2-f-datefield", label: "Date applies to" },
    ],
  },
  {
    group: "due2-table",
    groupLabel: "Due Table",
    items: [
      { key: "due2-c-select", label: "Select & Bulk Collect" },
      { key: "due2-c-customer", label: "Customer" },
      { key: "due2-c-order", label: "Order" },
      { key: "due2-c-amount", label: "Amount & Paid" },
      { key: "due2-c-balance", label: "Balance" },
      { key: "due2-c-promise", label: "Promise Date" },
      { key: "due2-c-status", label: "Status" },
      { key: "due2-c-actions", label: "Actions" },
      { key: "due2-t-search", label: "Search box" },
    ],
  },
];

export const DUE2_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "due2-range", label: "Date Range Bar" },
];
