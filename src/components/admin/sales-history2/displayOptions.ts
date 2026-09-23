import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /admin/ecommerce/sales-history — same panel and store
 * as dashboard2/billing2, with its own localStorage key so nothing hidden here
 * hides anything on another page. A group's checkbox shows/hides the whole
 * card; its items show/hide the parts inside it.
 */
export const SALES2_PREF_KEY = "ecom_sales_history2_display";

export const SALES2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "sh2-metrics",
    groupLabel: "Key Metrics",
    items: [
      { key: "sh2-m-total", label: "Total Sales" },
      { key: "sh2-m-today", label: "Today's Sale" },
      { key: "sh2-m-yesterday", label: "Yesterday's Sale" },
      { key: "sh2-m-week", label: "This Week's Sale" },
      { key: "sh2-m-month", label: "This Month's Sale" },
      { key: "sh2-m-due", label: "Today's Due Collection" },
    ],
  },
  {
    group: "sh2-ledger",
    groupLabel: "Sales Ledger",
    items: [
      { key: "sh2-c-time", label: "Time" },
      { key: "sh2-c-order", label: "Order ID" },
      { key: "sh2-c-customer", label: "Customer" },
      { key: "sh2-c-items", label: "Items" },
      { key: "sh2-c-payment", label: "Payment" },
      { key: "sh2-c-total", label: "Total" },
      { key: "sh2-c-paid", label: "Paid" },
      { key: "sh2-c-invoice", label: "Invoice" },
    ],
  },
];

export const SALES2_STANDALONE = [
  { key: "sh2-chart", label: "Sales Performance" },
  { key: "sh2-filters", label: "Filter Sales" },
] as const;
