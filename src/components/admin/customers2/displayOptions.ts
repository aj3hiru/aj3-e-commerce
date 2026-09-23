import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Display Options for /admin/ecommerce/customers (own localStorage key). */
export const CUSTOMERS2_PREF_KEY = "ecom_customers2_display";

export const CUSTOMERS2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "cus2-cards",
    groupLabel: "Key Metrics",
    items: [
      { key: "cus2-k-total", label: "All Customers" },
      { key: "cus2-k-online", label: "Online Customers" },
      { key: "cus2-k-offline", label: "Walk-in Customers" },
      { key: "cus2-k-dues", label: "With Dues" },
    ],
  },
  {
    group: "cus2-filters",
    groupLabel: "Filters",
    items: [
      { key: "cus2-f-type", label: "Customer Type" },
      { key: "cus2-f-status", label: "Status" },
      { key: "cus2-f-dues", label: "Dues" },
      { key: "cus2-f-activity", label: "Buying" },
      { key: "cus2-f-datefield", label: "Date applies to" },
    ],
  },
  {
    group: "cus2-table",
    groupLabel: "Customer Table",
    items: [
      { key: "cus2-c-customer", label: "Customer" },
      { key: "cus2-c-contact", label: "Contact" },
      { key: "cus2-c-type", label: "Type" },
      { key: "cus2-c-orders", label: "Orders" },
      { key: "cus2-c-spent", label: "Total Spent" },
      { key: "cus2-c-due", label: "Due" },
      { key: "cus2-c-status", label: "Status" },
      { key: "cus2-c-actions", label: "Actions" },
      { key: "cus2-t-search", label: "Search box" },
    ],
  },
];

export const CUSTOMERS2_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "cus2-chart", label: "Customer Growth graph" },
  { key: "cus2-range", label: "Date Range Bar" },
];
