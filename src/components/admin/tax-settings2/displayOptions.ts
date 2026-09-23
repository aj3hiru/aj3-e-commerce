import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

export const TAX2_PREF_KEY = "ecom_tax_settings2_display";

export const TAX2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "tx2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "tx2-k-total", label: "Total Slabs" },
      { key: "tx2-k-default", label: "Default Rate" },
      { key: "tx2-k-highest", label: "Highest Rate" },
      { key: "tx2-k-orphan", label: "Products Without a Matching Slab" },
    ],
  },
  {
    group: "tx2-table",
    groupLabel: "GST Slabs Table",
    items: [
      { key: "tx2-c-label", label: "Label" },
      { key: "tx2-c-rate", label: "Rate" },
      { key: "tx2-c-products", label: "Products" },
      { key: "tx2-c-default", label: "Default" },
      { key: "tx2-c-actions", label: "Actions" },
      { key: "tx2-t-search", label: "Table Search box" },
    ],
  },
];

export const TAX2_STANDALONE: readonly { key: string; label: string }[] = [];
