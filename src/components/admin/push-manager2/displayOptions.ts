import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /push-notifications/push-manager2 — same panel and store
 * as the other "2" pages, with its own localStorage key. A group's checkbox
 * shows/hides the whole section; its items show/hide the parts inside it.
 */
export const PUSH2_PREF_KEY = "push_manager2_display";

export const PUSH2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "pm2-header",
    groupLabel: "Header buttons",
    items: [
      { key: "pm2-b-export", label: "Export" },
      { key: "pm2-b-import", label: "Import" },
      { key: "pm2-b-new", label: "New Push" },
    ],
  },
  {
    group: "pm2-cards",
    groupLabel: "Summary Cards",
    items: [
      { key: "pm2-k-subs", label: "Subscribers" },
      { key: "pm2-k-campaigns", label: "Campaigns" },
      { key: "pm2-k-sent", label: "Delivered" },
      { key: "pm2-k-failed", label: "Failed" },
      { key: "pm2-k-rate", label: "Delivery Rate" },
    ],
  },
  {
    group: "pm2-types",
    groupLabel: "Promote options",
    items: [
      { key: "pm2-t-product", label: "Product" },
      { key: "pm2-t-category", label: "Category" },
      { key: "pm2-t-brand", label: "Brand" },
      { key: "pm2-t-post", label: "Blog Post" },
      { key: "pm2-t-custom", label: "Custom URL" },
    ],
  },
  {
    group: "pm2-compose",
    groupLabel: "Compose",
    items: [
      { key: "pm2-c-target", label: "What to promote" },
      { key: "pm2-c-templates", label: "Message templates" },
      { key: "pm2-c-fields", label: "Notification details" },
      { key: "pm2-c-counters", label: "Character counters" },
      { key: "pm2-c-utm", label: "UTM tracking" },
      { key: "pm2-c-actions", label: "Send buttons" },
      { key: "pm2-c-preview", label: "Lock screen preview" },
      { key: "pm2-c-note", label: "Preview note" },
    ],
  },
  {
    group: "pm2-history",
    groupLabel: "History",
    items: [
      { key: "pm2-h-live", label: "Live status line" },
      { key: "pm2-h-image", label: "Thumbnail" },
      { key: "pm2-h-status", label: "Status" },
      { key: "pm2-h-progress", label: "Progress" },
      { key: "pm2-h-counts", label: "Sent / Failed" },
      { key: "pm2-h-total", label: "Total" },
      { key: "pm2-h-time", label: "Time" },
      { key: "pm2-h-actions", label: "Actions" },
      { key: "pm2-h-pager", label: "Pagination" },
    ],
  },
  {
    group: "pm2-subs",
    groupLabel: "Subscribers",
    items: [
      { key: "pm2-s-breakdown", label: "Browser breakdown" },
      { key: "pm2-s-tools", label: "Import / Export" },
      { key: "pm2-s-table", label: "Subscriber list" },
      { key: "pm2-s-pager", label: "Pagination" },
    ],
  },
  {
    group: "pm2-settings",
    groupLabel: "Settings",
    items: [
      { key: "pm2-st-form", label: "VAPID keys form" },
      { key: "pm2-st-status", label: "Status panel" },
      { key: "pm2-st-help", label: "Key pair help" },
    ],
  },
];

export const PUSH2_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "pm2-notice", label: "Setup warning (only when keys are missing)" },
];

// Subscribers and Settings (and the header's Import/Export) need the
// push_notifications.manage_templates permission; without it those sections
// don't exist on the page, so the panel mustn't offer them either.
const MANAGE_ONLY = new Set(["pm2-subs", "pm2-settings"]);

export function push2Groups(canManage: boolean): readonly WidgetGroup[] {
  if (canManage) return PUSH2_GROUPS;
  return PUSH2_GROUPS.filter((g) => !MANAGE_ONLY.has(g.group)).map((g) =>
    g.group === "pm2-header" ? { ...g, items: g.items.filter((i) => i.key === "pm2-b-new") } : g);
}

export function push2Standalone(canManage: boolean): readonly { key: string; label: string }[] {
  return canManage ? PUSH2_STANDALONE : [];
}
