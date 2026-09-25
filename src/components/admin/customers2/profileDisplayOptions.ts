import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Display Options for one customer's profile (/admin/ecommerce/customers/[id]). */
export const CUSTPROFILE_PREF_KEY = "ecom_customer_profile_display";

export const CUSTPROFILE_GROUPS: readonly WidgetGroup[] = [
  {
    group: "cp-header",
    groupLabel: "Profile Header",
    items: [
      { key: "cp-h-contact", label: "Phone, email & since" },
      { key: "cp-h-login", label: "Login methods" },
      { key: "cp-h-actions", label: "Edit / New order buttons" },
      { key: "cp-h-call", label: "Call / WhatsApp buttons" },
    ],
  },
  {
    group: "cp-stats",
    groupLabel: "Numbers",
    items: [
      { key: "cp-k-orders", label: "Orders" },
      { key: "cp-k-spent", label: "Total spent" },
      { key: "cp-k-avg", label: "Average order" },
      { key: "cp-k-due", label: "Due" },
      { key: "cp-k-last", label: "Last order" },
    ],
  },
  {
    group: "cp-tabs",
    groupLabel: "Tabs",
    items: [
      { key: "cp-t-orders", label: "Orders" },
      { key: "cp-t-addresses", label: "Addresses" },
      { key: "cp-t-due", label: "Due history" },
    ],
  },
  {
    group: "cp-cols",
    groupLabel: "Orders Table",
    items: [
      { key: "cp-c-order", label: "Order" },
      { key: "cp-c-date", label: "Date" },
      { key: "cp-c-total", label: "Total" },
      { key: "cp-c-payment", label: "Payment" },
      { key: "cp-c-status", label: "Status" },
      { key: "cp-c-view", label: "Open button" },
    ],
  },
];

export const CUSTPROFILE_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "cp-address", label: "Address on file" },
];
