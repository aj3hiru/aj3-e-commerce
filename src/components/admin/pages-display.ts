import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Display Options for Static Pages (list + editor). */
export const PAGES_PREF_KEY = "ecom_pages_display";
export const PAGES_GROUPS: readonly WidgetGroup[] = [
  { group: "pg-stats", groupLabel: "Numbers", items: [{ key: "pg-k-total", label: "All pages" }, { key: "pg-k-published", label: "Published" }, { key: "pg-k-draft", label: "Drafts" }] },
  {
    group: "pg-table",
    groupLabel: "Pages Table",
    items: [
      { key: "pg-t-search", label: "Search box" },
      { key: "pg-t-tabs", label: "All / Published / Draft tabs" },
      { key: "pg-c-title", label: "Title" },
      { key: "pg-c-slug", label: "Link (slug)" },
      { key: "pg-c-status", label: "Status" },
      { key: "pg-c-updated", label: "Last updated" },
      { key: "pg-c-actions", label: "Actions" },
    ],
  },
];

export const PAGE_EDITOR_PREF_KEY = "ecom_page_editor_display";
export const PAGE_EDITOR_GROUPS: readonly WidgetGroup[] = [
  { group: "pe-form", groupLabel: "Form", items: [{ key: "pe-slug", label: "Slug" }, { key: "pe-status", label: "Status" }, { key: "pe-seo", label: "SEO (meta title & description)" }] },
  { group: "pe-preview", groupLabel: "Live Preview", items: [{ key: "pe-p-device", label: "Mobile / Desktop switch" }, { key: "pe-p-audience", label: "Guest / Logged-in switch" }] },
];

export const PROFILE_PREF_KEY = "ecom_my_profile_display";
export const PROFILE_GROUPS: readonly WidgetGroup[] = [
  { group: "mp-sections", groupLabel: "Sections", items: [{ key: "mp-card", label: "Photo & role card" }, { key: "mp-details", label: "Personal details" }, { key: "mp-password", label: "Change password" }] },
];

export const CUSTOMIZER_PREF_KEY = "ecom_customizer_display";
export const CUSTOMIZER_GROUPS: readonly WidgetGroup[] = [
  { group: "cz-tabs", groupLabel: "Section Tabs", items: [{ key: "cz-t-icons", label: "Icons" }, { key: "cz-t-hints", label: "Short descriptions" }] },
  {
    group: "cz-toolbar",
    groupLabel: "Preview Toolbar",
    items: [
      { key: "cz-b-status", label: "Save / publish status" },
      { key: "cz-b-device", label: "Mobile / Desktop switch" },
      { key: "cz-b-reload", label: "Reload preview button" },
      { key: "cz-b-open", label: "Open in new tab button" },
      { key: "cz-b-audience", label: "Guest / Logged-in switch (header & footer)" },
    ],
  },
];
export const CUSTOMIZER_STANDALONE = [{ key: "cz-draft-note", label: "“Edits save as a draft” note" }] as const;
