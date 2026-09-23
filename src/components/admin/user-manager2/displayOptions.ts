import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

export const USERS2_PREF_KEY = "user_manager2_display";

export const USERS2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "u2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "u2-k-total", label: "Total Users" },
      { key: "u2-k-admins", label: "Admins" },
      { key: "u2-k-active", label: "Active" },
      { key: "u2-k-suspended", label: "Suspended / Pending" },
    ],
  },
  {
    group: "u2-table",
    groupLabel: "Users Table",
    items: [
      { key: "u2-c-user", label: "User" },
      { key: "u2-c-role", label: "Role" },
      { key: "u2-c-status", label: "Status" },
      { key: "u2-c-permissions", label: "Permissions summary" },
      { key: "u2-c-actions", label: "Actions" },
      { key: "u2-t-search", label: "Table Search box" },
    ],
  },
];

export const USERS2_STANDALONE: readonly { key: string; label: string }[] = [];
