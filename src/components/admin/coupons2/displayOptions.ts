import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

export const COUPONS2_PREF_KEY = "ecom_coupons2_display";

export const COUPONS2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "cp2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "cp2-k-active", label: "Active Coupons" },
      { key: "cp2-k-scheduled", label: "Scheduled Coupons" },
      { key: "cp2-k-expired", label: "Expired Coupons" },
      { key: "cp2-k-redemptions", label: "Total Redemptions" },
    ],
  },
  {
    group: "cp2-grid",
    groupLabel: "Coupon Grid",
    items: [
      { key: "cp2-search", label: "Search & filters" },
    ],
  },
  {
    group: "cp2-activity",
    groupLabel: "Recent Activity panel",
    items: [
      { key: "cp2-activity-panel", label: "Recent Activity" },
    ],
  },
];

export const COUPONS2_STANDALONE: readonly { key: string; label: string }[] = [];
