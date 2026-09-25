// ════════════════════════════════════════════════════════════════════════
// Verified 1:1 against DEFAULT_PERMISSIONS + getRolePermissionDefaults() in
// admin/user-manager.php. This is the authoritative permission taxonomy for
// the whole app — every permission check elsewhere (admin-auth.ts,
// admin-nav-config.ts, every API route's hasPermission() call) should use
// keys from this structure.
//
// NOTE: the "blogs"/"authors"/"ads"/"pages" groups exist in the real app but
// are out of scope for this build (blog section explicitly excluded) — they
// are still included here for schema/permission-JSON compatibility with the
// original app, so a user record imported from the old database round-trips
// correctly, but no UI in this project currently reads or writes them beyond
// preserving whatever value was already there.
// ════════════════════════════════════════════════════════════════════════

export interface PermissionsShape {
  dashboard_access: boolean;
  blogs: {
    create: boolean; edit_own: boolean; edit_all: boolean; delete_own: boolean; delete_all: boolean;
    publish: boolean; unpublish: boolean; schedule: boolean; feature: boolean;
    manage_categories: boolean; manage_tags: boolean; manage_comments: boolean;
    view_drafts: boolean; manage_seo: boolean;
  };
  media: { upload: boolean; delete: boolean; manage_all: boolean };
  push_notifications: { send: boolean; schedule: boolean; manage_templates: boolean };
  ecommerce: {
    manage_categories: boolean; manage_products: boolean; manage_orders: boolean;
    manage_customers: boolean; manage_coupons: boolean; manage_payment: boolean;
    manage_billing: boolean; manage_credits: boolean; manage_homepage: boolean;
  };
  /** Online-order desk, finer than ecommerce.manage_orders (which older accounts still carry — see normalizePermissions). */
  orders: { view: boolean; accept_reject: boolean; update_status: boolean; assign_delivery: boolean; mark_paid: boolean; edit_items: boolean; cancel: boolean };
  /** deliver = a delivery agent (sees and completes their own deliveries); view_all = the deliveries board. */
  delivery: { deliver: boolean; view_all: boolean };
  users: { create: boolean; edit: boolean; delete: boolean; suspend: boolean; change_roles: boolean; manage_permissions: boolean };
  authors: { create: boolean; edit: boolean; delete: boolean; approve: boolean; feature: boolean };
  analytics: { view_basic: boolean; view_advanced: boolean };
  ads: { manage_ads: boolean; view_revenue: boolean };
  settings: { general: boolean; seo: boolean; smtp: boolean; api_keys: boolean; maintenance_mode: boolean };
  pages: { create: boolean; edit: boolean; delete: boolean };
  files: { access_file_manager: boolean };
  security: { view_logs: boolean; manage_blacklist: boolean; manage_recaptcha: boolean };
}

export const DEFAULT_PERMISSIONS: PermissionsShape = {
  dashboard_access: false,
  blogs: {
    create: false, edit_own: false, edit_all: false, delete_own: false, delete_all: false,
    publish: false, unpublish: false, schedule: false, feature: false,
    manage_categories: false, manage_tags: false, manage_comments: false,
    view_drafts: false, manage_seo: false,
  },
  media: { upload: false, delete: false, manage_all: false },
  push_notifications: { send: false, schedule: false, manage_templates: false },
  ecommerce: {
    manage_categories: false, manage_products: false, manage_orders: false,
    manage_customers: false, manage_coupons: false, manage_payment: false,
    manage_billing: false, manage_credits: false, manage_homepage: false,
  },
  orders: { view: false, accept_reject: false, update_status: false, assign_delivery: false, mark_paid: false, edit_items: false, cancel: false },
  delivery: { deliver: false, view_all: false },
  users: { create: false, edit: false, delete: false, suspend: false, change_roles: false, manage_permissions: false },
  authors: { create: false, edit: false, delete: false, approve: false, feature: false },
  analytics: { view_basic: false, view_advanced: false },
  ads: { manage_ads: false, view_revenue: false },
  settings: { general: false, seo: false, smtp: false, api_keys: false, maintenance_mode: false },
  pages: { create: false, edit: false, delete: false },
  files: { access_file_manager: false },
  security: { view_logs: false, manage_blacklist: false, manage_recaptcha: false },
};

/** Deep-clones DEFAULT_PERMISSIONS so callers can freely mutate the result. */
function cloneDefaults(): PermissionsShape {
  return JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
}

/** Counts how many individual permission leaves (across every group) are
 *  `true` in a given permissions object — used by user-manager2 to show a
 *  quick "42 / 85 granted" summary per user without listing every checkbox. */
export function countGrantedPermissions(permissions: PermissionsShape): number {
  // Only keys that exist in the permission map count (older accounts can carry retired keys).
  let count = 0;
  const walk = (shape: unknown, value: unknown) => {
    if (typeof shape === "boolean") { if (value === true) count++; return; }
    if (shape && typeof shape === "object") for (const k of Object.keys(shape)) walk((shape as Record<string, unknown>)[k], (value as Record<string, unknown> | undefined)?.[k]);
  };
  walk(DEFAULT_PERMISSIONS, permissions);
  return count;
}

/** Verified against getRolePermissionDefaults() — role-based presets used to
 *  pre-fill the permission checkboxes when creating a user with "Advance Access". */
export function getRolePermissionDefaults(role: string): PermissionsShape {
  const all = cloneDefaults();
  const preset = STORE_ROLE_PRESETS[role];
  if (preset) { preset(all); return all; }

  if (role === "admin") {
    // Admin: everything ticked by default (array_walk_recursive($all, fn(&$v) => $v = true))
    const setAllTrue = (obj: Record<string, unknown>) => {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === "object" && obj[key] !== null) setAllTrue(obj[key] as Record<string, unknown>);
        else obj[key] = true;
      }
    };
    setAllTrue(all as unknown as Record<string, unknown>);
    return all;
  }

  if (role === "editor") {
    all.dashboard_access = true;
    (Object.keys(all.blogs) as (keyof typeof all.blogs)[]).forEach((k) => (all.blogs[k] = true));
    (Object.keys(all.media) as (keyof typeof all.media)[]).forEach((k) => (all.media[k] = true));
    all.push_notifications.send = true;
    all.push_notifications.schedule = true;
    all.authors.edit = true;
    all.authors.approve = true;
    all.authors.feature = true;
    all.analytics.view_basic = true;
    all.analytics.view_advanced = true;
    all.pages.create = true;
    all.pages.edit = true;
    all.files.access_file_manager = true;
    return all;
  }

  // author (default)
  all.dashboard_access = true;
  all.blogs.create = true;
  all.blogs.edit_own = true;
  all.blogs.delete_own = true;
  all.blogs.view_drafts = true;
  all.blogs.manage_seo = true;
  all.media.upload = true;
  all.analytics.view_basic = true;
  all.files.access_file_manager = true;
  return all;
}

/** Verified against renderPermissionsPanel()'s $labels + $groupIcons maps —
 *  used to render the permission checkbox grid in the same grouping/order/
 *  labeling as the original admin UI. lucide-react icon names substituted
 *  for the original Font Awesome classes. */
export const PERMISSION_GROUPS: {
  key: keyof PermissionsShape;
  label: string;
  icon: string;
  fields?: Record<string, string>;
}[] = [
  { key: "dashboard_access", label: "Dashboard Access", icon: "Gauge" },
  {
    key: "blogs", label: "Blogs", icon: "Rss",
    fields: { create: "Create", edit_own: "Edit Own", edit_all: "Edit All", delete_own: "Delete Own", delete_all: "Delete All", publish: "Publish", unpublish: "Unpublish", schedule: "Schedule", feature: "Feature", manage_categories: "Categories", manage_tags: "Tags", manage_comments: "Comments", view_drafts: "View Drafts", manage_seo: "Manage SEO" },
  },
  { key: "media", label: "Media", icon: "Images", fields: { upload: "Upload", delete: "Delete", manage_all: "Manage All" } },
  { key: "push_notifications", label: "Push Notifications", icon: "Bell", fields: { send: "Send", schedule: "Schedule", manage_templates: "Subscribers & Settings" } },
  {
    key: "ecommerce", label: "Ecommerce", icon: "Store",
    // Real bug fixed here: Homepage Settings was gated on manage_payment
    // ("Payment Settings" in this very panel) — completely unrelated to
    // managing the storefront's banner slider/sections. An admin granted
    // every other ecommerce permission except Payment Settings hit
    // "Access Denied" on every single homepage action, making the whole
    // feature look broken. New manage_homepage field, checked instead.
    fields: { manage_categories: "Categories", manage_products: "Products", manage_orders: "Orders", manage_customers: "Customers", manage_coupons: "Coupons", manage_payment: "Payment Settings", manage_billing: "Billing / POS", manage_credits: "Due", manage_homepage: "Homepage Settings" },
  },
  {
    key: "orders", label: "Online Orders", icon: "ClipboardList",
    fields: { view: "View orders", accept_reject: "Accept / Reject", update_status: "Change status", assign_delivery: "Assign delivery agent", mark_paid: "Mark paid / unpaid", edit_items: "Edit items", cancel: "Cancel orders" },
  },
  { key: "delivery", label: "Delivery", icon: "Truck", fields: { deliver: "Is a delivery agent (own deliveries)", view_all: "Deliveries board (all agents)" } },
  { key: "users", label: "Users", icon: "Users", fields: { create: "Create", edit: "Edit", delete: "Delete", suspend: "Suspend", change_roles: "Change Roles", manage_permissions: "Manage Permissions" } },
  { key: "authors", label: "Authors", icon: "Feather", fields: { create: "Create", edit: "Edit", delete: "Delete", approve: "Approve", feature: "Feature" } },
  { key: "analytics", label: "Analytics", icon: "BarChart3", fields: { view_basic: "Basic Analytics", view_advanced: "Advanced Analytics" } },
  { key: "ads", label: "Ads", icon: "Megaphone", fields: { manage_ads: "Manage Ads", view_revenue: "View Revenue" } },
  { key: "settings", label: "Settings", icon: "Settings", fields: { general: "General", seo: "SEO", smtp: "SMTP", api_keys: "API Keys", maintenance_mode: "Maintenance" } },
  { key: "pages", label: "Pages", icon: "FileText", fields: { create: "Create", edit: "Edit", delete: "Delete" } },
  { key: "files", label: "Files", icon: "Folder", fields: { access_file_manager: "File Manager" } },
  { key: "security", label: "Security", icon: "Shield", fields: { view_logs: "View Logs", manage_blacklist: "Blacklist", manage_recaptcha: "reCAPTCHA" } },
];

/* ───────────────────────── store roles ───────────────────────── */

type Setter = (p: PermissionsShape) => void;
const allOf = <T extends Record<string, boolean>>(g: T) => { (Object.keys(g) as (keyof T)[]).forEach((k) => ((g[k] as boolean) = true)); };

/** Permission presets for the store roles (see lib/roles.ts). Admin = everything. */
export const STORE_ROLE_PRESETS: Record<string, Setter> = {
  admin: (p) => {
    const walk = (o: Record<string, unknown>) => { for (const k of Object.keys(o)) { if (o[k] && typeof o[k] === "object") walk(o[k] as Record<string, unknown>); else o[k] = true; } };
    walk(p as unknown as Record<string, unknown>);
  },
  manager: (p) => {
    p.dashboard_access = true;
    allOf(p.ecommerce); allOf(p.orders); p.delivery.view_all = true;
    allOf(p.analytics); allOf(p.push_notifications); p.media.upload = true; p.files.access_file_manager = true;
  },
  order_manager: (p) => {
    p.dashboard_access = true;
    allOf(p.orders); p.orders.edit_items = false;
    p.delivery.view_all = true; p.ecommerce.manage_customers = true; p.analytics.view_basic = true;
  },
  delivery_agent: (p) => { p.dashboard_access = true; p.delivery.deliver = true; },
  cashier: (p) => {
    p.dashboard_access = true;
    p.ecommerce.manage_billing = true; p.ecommerce.manage_credits = true; p.ecommerce.manage_customers = true;
    p.orders.view = true; p.orders.mark_paid = true; p.analytics.view_basic = true;
  },
  catalog_manager: (p) => {
    p.dashboard_access = true;
    p.ecommerce.manage_products = true; p.ecommerce.manage_categories = true;
    p.media.upload = true; p.media.delete = true; p.files.access_file_manager = true; p.analytics.view_basic = true;
  },
  marketing: (p) => {
    p.dashboard_access = true;
    p.ecommerce.manage_homepage = true; p.ecommerce.manage_coupons = true;
    allOf(p.push_notifications); p.analytics.view_basic = true; p.media.upload = true; p.files.access_file_manager = true;
  },
};

/**
 * Fills in groups an older account doesn't have yet so every check can use
 * the fine-grained keys: the orders group follows ecommerce.manage_orders
 * (that permission used to cover everything about orders), delivery is off,
 * and an admin always has everything.
 */
export function normalizePermissions(raw: unknown, role: string): Record<string, Record<string, boolean>> {
  const p = (raw && typeof raw === "object" ? JSON.parse(JSON.stringify(raw)) : {}) as Record<string, unknown>;
  const eco = (p.ecommerce ?? {}) as Record<string, boolean>;
  if (!p.orders || typeof p.orders !== "object") {
    const on = !!eco.manage_orders;
    p.orders = { view: on, accept_reject: on, update_status: on, assign_delivery: on, mark_paid: on, edit_items: on, cancel: on };
  }
  if (!p.delivery || typeof p.delivery !== "object") p.delivery = { deliver: false, view_all: !!eco.manage_orders };
  if (role === "admin") {
    const full = getRolePermissionDefaults("admin") as unknown as Record<string, unknown>;
    for (const [g, v] of Object.entries(full)) if (v && typeof v === "object") p[g] = v;
    p.dashboard_access = true;
  }
  return p as Record<string, Record<string, boolean>>;
}
