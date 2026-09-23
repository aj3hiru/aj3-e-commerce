import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

export const FILEMANAGER2_PREF_KEY = "file_manager2_display";

export const FILEMANAGER2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "fm2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "fm2-k-total", label: "Total Files" },
      { key: "fm2-k-images", label: "Images" },
      { key: "fm2-k-pdfs", label: "PDFs" },
      { key: "fm2-k-assets", label: "Site Assets" },
    ],
  },
  {
    group: "fm2-upload",
    groupLabel: "Upload zone",
    items: [{ key: "fm2-upload-zone", label: "Drag & drop upload area" }],
  },
  {
    group: "fm2-toolbar",
    groupLabel: "Search & filters",
    items: [
      { key: "fm2-f-search", label: "Search box" },
      { key: "fm2-f-type", label: "Type filter" },
      { key: "fm2-f-category", label: "Category filter" },
      { key: "fm2-f-sort", label: "Sort" },
    ],
  },
];

export const FILEMANAGER2_STANDALONE: readonly { key: string; label: string }[] = [];
