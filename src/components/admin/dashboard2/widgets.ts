import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /admin/dashboard2.
 *
 * Its own localStorage key on purpose: visibility is stored by widget name, so
 * sharing the original dashboard's key would let hiding a card here hide an
 * unrelated card there (and vice versa). Delete this file with dashboard2.
 */
export const DASHBOARD2_PREF_KEY = "ecom_dashboard2_widgets";

export const DASHBOARD2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "d2-orders",
    groupLabel: "Orders & Customers",
    items: [
      { key: "d2-on-total", label: "Total Orders" },
      { key: "d2-on-pending", label: "Pending Orders" },
      { key: "d2-on-progress", label: "In Progress" },
      { key: "d2-on-delivered", label: "Delivered Orders" },
      { key: "d2-on-canceled", label: "Canceled Orders" },
      { key: "d2-cust-online", label: "Total Online Customers" },
      { key: "d2-cust-offline", label: "Total Offline Customers" },
    ],
  },
  {
    group: "d2-earnings",
    groupLabel: "Earnings & Due",
    items: [
      { key: "d2-earning", label: "Earnings" },
      { key: "d2-due", label: "Due" },
      { key: "d2-received", label: "Payment Received" },
      { key: "d2-pending-pay", label: "Pending Payment" },
    ],
  },
  {
    group: "d2-overview",
    groupLabel: "Store Overview",
    items: [
      { key: "d2-products", label: "Products" },
      { key: "d2-categories", label: "Categories" },
      { key: "d2-brands", label: "Brands" },
      { key: "d2-coupons", label: "Active Coupons" },
    ],
  },
];

export const DASHBOARD2_STANDALONE = [
  { key: "d2-recent", label: "Recent Orders" },
  { key: "d2-sales", label: "Sales Overview" },
] as const;
