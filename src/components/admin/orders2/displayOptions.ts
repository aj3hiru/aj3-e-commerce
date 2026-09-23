import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Display Options for /admin/ecommerce/orders (own localStorage key). */
export const ORDERS2_PREF_KEY = "ecom_orders2_display";

export const ORDERS2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "or2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "or2-k-total", label: "Orders in view" },
      { key: "or2-k-today", label: "Today's Orders" },
      { key: "or2-k-unpaid", label: "Unpaid" },
      { key: "or2-k-value", label: "Order Value" },
      { key: "or2-k-pending", label: "Pending" },
      { key: "or2-k-in-progress", label: "In Progress" },
      { key: "or2-k-out-for-delivery", label: "Out for Delivery" },
      { key: "or2-k-delivered", label: "Delivered" },
    ],
  },
  {
    group: "or2-filters",
    groupLabel: "Filters",
    items: [
      { key: "or2-f-payment", label: "Payment" },
      { key: "or2-f-method", label: "Payment Method" },
      { key: "or2-f-product", label: "Product" },
      { key: "or2-f-dues", label: "Balance" },
    ],
  },
  {
    group: "or2-table",
    groupLabel: "Order Table",
    items: [
      { key: "or2-c-order", label: "Order" },
      { key: "or2-c-customer", label: "Customer" },
      { key: "or2-c-items", label: "Items" },
      { key: "or2-c-total", label: "Total" },
      { key: "or2-c-payment", label: "Payment" },
      { key: "or2-c-status", label: "Status" },
      { key: "or2-c-actions", label: "Actions" },
      { key: "or2-t-search", label: "Search box" },
    ],
  },
];

export const ORDERS2_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "or2-range", label: "Date Range Bar" },
  { key: "or2-tabs", label: "Status Tabs" },
];
