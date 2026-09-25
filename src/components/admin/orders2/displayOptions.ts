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
      { key: "or2-f-agent", label: "Delivery agent" },
    ],
  },
  {
    group: "or2-table",
    groupLabel: "Order Table",
    items: [
      { key: "or2-c-select", label: "Tick boxes (bulk actions)" },
      { key: "or2-c-order", label: "Order" },
      { key: "or2-c-customer", label: "Customer" },
      { key: "or2-c-items", label: "Items" },
      { key: "or2-c-total", label: "Total" },
      { key: "or2-c-payment", label: "Payment" },
      { key: "or2-c-status", label: "Status" },
      { key: "or2-c-agent", label: "Delivery agent" },
      { key: "or2-c-contact", label: "Call / WhatsApp / map buttons" },
      { key: "or2-c-actions", label: "Actions" },
      { key: "or2-t-search", label: "Search box" },
      { key: "or2-t-pagesize", label: "Orders per page" },
    ],
  },
  {
    group: "or2-details",
    groupLabel: "Row Details",
    items: [
      { key: "or2-d-date", label: "Order date & time" },
      { key: "or2-d-phone", label: "Customer phone / email" },
      { key: "or2-d-itemname", label: "First item name" },
      { key: "or2-d-method", label: "Payment method" },
      { key: "or2-d-due", label: "Amount still due" },
      { key: "or2-d-decide", label: "Accept / Reject buttons" },
      { key: "or2-d-agentline", label: "Agent name under status" },
      { key: "or2-d-highlight", label: "Highlight new orders" },
      { key: "or2-d-compact", label: "Compact rows" },
    ],
  },
];

export const ORDERS2_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "or2-range", label: "Date range" },
  { key: "or2-tabs", label: "Status tabs" },
  { key: "or2-bulk", label: "Bulk actions bar (when orders are ticked)" },
  { key: "or2-summary", label: "Summary line (count & value shown)" },
  { key: "or2-pager", label: "Page numbers" },
];
