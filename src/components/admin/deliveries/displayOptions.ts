import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Display Options for the Deliveries board (/admin/deliveries?view=all). */
export const DELIVERIES_PREF_KEY = "ecom_deliveries_display";

export const DELIVERIES_GROUPS: readonly WidgetGroup[] = [
  {
    group: "dv-stats",
    groupLabel: "Numbers",
    items: [
      { key: "dv-k-waiting", label: "Waiting for an agent" },
      { key: "dv-k-onway", label: "On the way" },
      { key: "dv-k-delivered", label: "Delivered today" },
      { key: "dv-k-collect", label: "Cash to collect" },
      { key: "dv-k-cash", label: "Cash collected today" },
      { key: "dv-k-agents", label: "Agents busy / free" },
    ],
  },
  {
    group: "dv-waiting",
    groupLabel: "Waiting for an Agent",
    items: [
      { key: "dv-w-customer", label: "Customer" },
      { key: "dv-w-amount", label: "Amount" },
      { key: "dv-w-payment", label: "Paid / to collect" },
      { key: "dv-w-address", label: "Address" },
      { key: "dv-w-items", label: "Items" },
      { key: "dv-w-contact", label: "Call / map buttons" },
      { key: "dv-w-assign", label: "Assign box" },
    ],
  },
  {
    group: "dv-agents",
    groupLabel: "Agent Cards",
    items: [
      { key: "dv-a-summary", label: "Active / delivered line" },
      { key: "dv-a-collect", label: "To collect" },
      { key: "dv-a-cash", label: "Cash today" },
      { key: "dv-a-orders", label: "Order list" },
      { key: "dv-a-customer", label: "Customer & amount line" },
      { key: "dv-a-time", label: "Assigned how long ago" },
      { key: "dv-a-status", label: "On the way / to pick up tag" },
    ],
  },
];

export const DELIVERIES_STANDALONE: readonly { key: string; label: string }[] = [];
