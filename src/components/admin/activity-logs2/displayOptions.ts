import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

export const ACTIVITYLOGS2_PREF_KEY = "activity_logs2_display";

export const ACTIVITYLOGS2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "al2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "al2-k-total", label: "Total Events" },
      { key: "al2-k-today", label: "Today" },
      { key: "al2-k-security", label: "Security Events" },
      { key: "al2-k-failed", label: "Failed Actions" },
    ],
  },
  {
    group: "al2-table",
    groupLabel: "Logs Table",
    items: [
      { key: "al2-c-user", label: "User" },
      { key: "al2-c-action", label: "Action" },
      { key: "al2-c-description", label: "Description" },
      { key: "al2-c-tech", label: "Tech Info" },
      { key: "al2-c-severity", label: "Severity" },
      { key: "al2-c-date", label: "Date" },
    ],
  },
];

export const ACTIVITYLOGS2_STANDALONE: readonly { key: string; label: string }[] = [];
