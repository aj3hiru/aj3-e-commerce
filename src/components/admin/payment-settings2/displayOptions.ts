import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

export const PAYMENT2_PREF_KEY = "ecom_payment_settings2_display";

export const PAYMENT2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "pm2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "pm2-k-enabled", label: "Enabled Methods" },
      { key: "pm2-k-configured", label: "Configured Methods" },
      { key: "pm2-k-default", label: "Default Method" },
    ],
  },
  {
    group: "pm2-default",
    groupLabel: "Default Payment Method panel",
    items: [{ key: "pm2-default-panel", label: "Default Payment Method" }],
  },
];

export const PAYMENT2_STANDALONE: readonly { key: string; label: string }[] = [];
