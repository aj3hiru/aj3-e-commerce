import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Display Options for /admin/ecommerce/barcode-print (own localStorage key). */
export const BARCODES2_PREF_KEY = "ecom_barcodes2_display";

export const BARCODES2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "bc2-cards",
    groupLabel: "Key Metrics",
    items: [
      { key: "bc2-k-added", label: "Added Today" },
      { key: "bc2-k-updated", label: "Updated Today" },
      { key: "bc2-k-range", label: "In This Range" },
      { key: "bc2-k-queue", label: "Labels to Print" },
      { key: "bc2-k-missing", label: "No Barcode Yet" },
      { key: "bc2-k-total", label: "All Products" },
    ],
  },
];

export const BARCODES2_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "bc2-range", label: "Date Range Bar" },
  { key: "bc2-preview", label: "Label Preview" },
  { key: "bc2-picker", label: "Add Products box" },
  { key: "bc2-list", label: "Print List" },
];
