import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

export const CACHEMGR2_PREF_KEY = "cache_manager2_display";

export const CACHEMGR2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "cm2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "cm2-k-size", label: "Cache Size" },
      { key: "cm2-k-posts", label: "Trackable Blog Posts" },
      { key: "cm2-k-total", label: "Total Clears" },
      { key: "cm2-k-last", label: "Last Cleared" },
    ],
  },
  {
    group: "cm2-redis",
    groupLabel: "Redis Cache panel",
    items: [{ key: "cm2-redis-panel", label: "Redis status & flush" }],
  },
  {
    group: "cm2-sections",
    groupLabel: "Cache Sections",
    items: [{ key: "cm2-sections-list", label: "Section cards" }],
  },
  {
    group: "cm2-history",
    groupLabel: "Clear History panel",
    items: [{ key: "cm2-history-panel", label: "Clear History" }],
  },
];

export const CACHEMGR2_STANDALONE: readonly { key: string; label: string }[] = [];
