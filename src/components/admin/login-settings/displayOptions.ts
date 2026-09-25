import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Display Options for Business Settings → Login & OTP. */
export const LOGIN_PREF_KEY = "ecom_login_settings_display";

export const LOGIN_GROUPS: readonly WidgetGroup[] = [
  {
    group: "ls-sections",
    groupLabel: "Sections",
    items: [
      { key: "ls-status", label: "Status banner" },
      { key: "ls-options", label: "Login options" },
      { key: "ls-firebase", label: "Firebase web config" },
      { key: "ls-steps", label: "Firebase setup steps" },
    ],
  },
  {
    group: "ls-preview",
    groupLabel: "Live Preview",
    items: [
      { key: "ls-p-device", label: "Mobile / Desktop switch" },
      { key: "ls-p-audience", label: "Guest / Logged-in switch" },
    ],
  },
];

export const LOGIN_STANDALONE: readonly { key: string; label: string }[] = [];
