import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

export const ANALYTICS2_PREF_KEY = "ecom_analytics2_display";

export const ANALYTICS2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "a2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "a2-k-gross", label: "Gross Sales" },
      { key: "a2-k-net", label: "Net Sales" },
      { key: "a2-k-orders", label: "Orders" },
      { key: "a2-k-aov", label: "Avg Order Value" },
    ],
  },
  {
    group: "a2-widgets",
    groupLabel: "Widgets",
    items: [
      { key: "a2-chart", label: "Revenue & Orders Overview" },
      { key: "a2-payment", label: "Sales by Payment Method" },
      { key: "a2-top", label: "Top Products" },
      { key: "a2-category", label: "Revenue by Category" },
      { key: "a2-insight", label: "Insight card" },
      { key: "a2-customers", label: "New vs Returning Customers" },
    ],
  },
];

export const ANALYTICS2_STANDALONE: readonly { key: string; label: string }[] = [];
