import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faHome, faCashRegister, faHistory, faBoxes, faPlusSquare, faCopyright, faBoxOpen,
  faStarHalfAlt, faBarcode, faTags, faList, faReceipt,
  faTruck, faUserFriends, faPercentage,
  faBuilding, faHandHoldingUsd, faImages, faBell, faBolt, faUser,
  faSignOutAlt, faMobileAlt, faFileInvoiceDollar, faChartLine, faFileAlt, faBars, faGripLines, faBox,
  faBrush, faCog, faUsersCog,
} from "@fortawesome/free-solid-svg-icons";

// Grouped by what a shop owner does: sell, catalogue, customers & marketing,
// reports, the online store, settings. Rarely used pages sit in a parent's
// submenu so the sidebar stays short. Every entry keeps its own permission.

export type NavPermissionPath =
  | "ecommerce.manage_billing"
  | "ecommerce.manage_products"
  | "ecommerce.manage_categories"
  | "ecommerce.manage_orders"
  | "orders.view"
  | "delivery.deliver"
  | "delivery.view_all"
  | "ecommerce.manage_customers"
  | "ecommerce.manage_coupons"
  | "ecommerce.manage_payment"
  | "ecommerce.manage_homepage"
  | "ecommerce.manage_credits"
  | "files.access_file_manager"
  | "pages.create"
  | "push_notifications.send"
  | "reports.any" // special: orders (manage_orders) or billing (manage_billing)
  | "offers.any" // special: campaigns (manage_products) or coupons (manage_coupons)
  | "blogs.any" // special: true if ANY key under `blogs` is true, OR analytics.view_basic is true
  | "blogs.manage_categories"
  | "blogs.manage_tags"
  | "blogs.manage_comments"
  | "analytics.view_basic"
  | "settings.maintenance_mode"
  | "security.view_logs"
  | "users.create"
  | null; // null = always visible, no permission gate

export interface NavLink {
  href: string;
  label: string;
  /** The exact Font Awesome 6.4 glyph sidebar-nav.php uses (`<i class="fas fa-…">`).
   *  FA rather than Lucide on purpose: the two icon sets draw different
   *  shapes, so no Lucide substitute can ever look like the original. */
  icon: IconDefinition;
  /** Rendered as a POST form instead of a link — see AdminSidebar. */
  isLogout?: boolean;
  permission: NavPermissionPath;
  /** Other pages that belong to this entry (they highlight it too). */
  alsoActive?: string[];
  /** Used to compute the "active" state beyond a simple pathname match (e.g. orders.php?type=Pending) */
  matchQuery?: { key: string; value: string };
}

export interface NavParent extends NavLink {
  /** A parent that only opens its submenu (no page of its own). */
  toggleOnly?: boolean;
  submenu?: NavLink[];
  /** Whether this submenu group is open by default (Products defaults open; others default closed) */
  defaultOpen?: boolean;
  /** submenu id used for localStorage persistence, mirrors PHP's `submenu-products` etc. */
  submenuId?: string;
}

export interface NavSection {
  title: string; // e.g. "Main", "Billing", "Manage Products"
  /** If true, the whole section title becomes a collapsible group header (used only for Blog) */
  collapsibleGroup?: boolean;
  submenuId?: string;
  permission: NavPermissionPath;
  links: NavParent[];
}

export const ADMIN_NAV: NavSection[] = [
  {
    title: "Main",
    permission: null,
    links: [
      { href: "/admin/dashboard", label: "Dashboard", icon: faHome, permission: null },
    ],
  },

  {
    title: "Sales",
    permission: null,
    links: [
      { href: "/admin/ecommerce/billing", label: "Billing / POS", icon: faCashRegister, permission: "ecommerce.manage_billing" },
      // Status filters (Pending, In Progress…) are tabs on the Orders page itself.
      { href: "/admin/ecommerce/orders", label: "Orders", icon: faReceipt, permission: "orders.view" },
      { href: "/admin/deliveries?view=all", label: "Deliveries", icon: faTruck, permission: "delivery.view_all", matchQuery: { key: "view", value: "all" } },
      { href: "/admin/ecommerce/due", label: "Due Payments", icon: faHandHoldingUsd, permission: "ecommerce.manage_credits" },
    ],
  },

  {
    title: "Catalog",
    permission: null,
    links: [
      {
        href: "/admin/ecommerce/products",
        label: "Products",
        icon: faBoxes,
        permission: "ecommerce.manage_products",
        submenuId: "submenu-products",
        submenu: [
          { href: "/admin/ecommerce/products/add", label: "Add Product", icon: faPlusSquare, permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/stock-out-products", label: "Stock Out", icon: faBoxOpen, permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/product-reviews", label: "Reviews", icon: faStarHalfAlt, permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/brands", label: "Brands", icon: faCopyright, permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/product-tags", label: "Badge Tags & Item Types", icon: faTags, permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/barcode-print", label: "Print Barcodes", icon: faBarcode, permission: "ecommerce.manage_products" },
        ],
      },
      { href: "/admin/ecommerce/categories", label: "Categories", icon: faList, permission: "ecommerce.manage_categories" },
    ],
  },

  {
    title: "Customers & Marketing",
    permission: null,
    links: [
      { href: "/admin/ecommerce/customers", label: "Customers", icon: faUserFriends, permission: "ecommerce.manage_customers" },
      // Campaign Offers (automatic price drops) and Coupons (codes) — one entry, two tabs.
      { href: "/admin/ecommerce/offers", label: "Offers & Coupons", icon: faPercentage, permission: "offers.any",
        alsoActive: ["/admin/ecommerce/campaign-offer", "/admin/ecommerce/coupons"] },
      { href: "/push-notifications/push-manager2", label: "Push Notifications", icon: faBell, permission: "push_notifications.send" },
    ],
  },

  {
    title: "Reports",
    permission: null,
    links: [
      { href: "/admin/ecommerce/reports", label: "Report Builder", icon: faFileInvoiceDollar, permission: "reports.any" },
      { href: "/admin/ecommerce/analytics", label: "Sales Analytics", icon: faChartLine, permission: "ecommerce.manage_orders" },
      { href: "/admin/ecommerce/sales-history", label: "Sales History", icon: faHistory, permission: "ecommerce.manage_billing" },
    ],
  },

  {
    title: "Online Store",
    permission: null,
    links: [
      {
        href: "/admin/customizer",
        label: "Store Customizer",
        icon: faBrush,
        permission: "ecommerce.manage_homepage",
        submenuId: "submenu-customizer",
        submenu: [
          { href: "/admin/customizer?tab=home", label: "Homepage", icon: faHome, permission: "ecommerce.manage_homepage", matchQuery: { key: "tab", value: "home" } },
          { href: "/admin/customizer?tab=product", label: "Product Page", icon: faBox, permission: "ecommerce.manage_homepage", matchQuery: { key: "tab", value: "product" } },
          { href: "/admin/customizer?tab=header", label: "Header & Menus", icon: faBars, permission: "ecommerce.manage_payment", matchQuery: { key: "tab", value: "header" } },
          { href: "/admin/customizer?tab=footer", label: "Footer", icon: faGripLines, permission: "ecommerce.manage_payment", matchQuery: { key: "tab", value: "footer" } },
        ],
      },
      { href: "/admin/pages", label: "Static Pages", icon: faFileAlt, permission: "pages.create" },
      { href: "/admin/file-manager", label: "File Manager", icon: faImages, permission: "files.access_file_manager" },
    ],
  },

  {
    title: "Settings",
    permission: null,
    links: [
      // Payment Methods, GST / Tax Rates and Login & OTP live inside Business Settings' own menu.
      { href: "/admin/ecommerce/business-settings", label: "Business Settings", icon: faBuilding, permission: "ecommerce.manage_payment",
        alsoActive: ["/admin/ecommerce/payment-settings", "/admin/ecommerce/tax-settings", "/admin/ecommerce/login-settings"] },
      { href: "/admin/user-manager", label: "Staff & Roles", icon: faUsersCog, permission: "users.create" },
      {
        href: "#system",
        label: "System",
        icon: faCog,
        permission: null,
        toggleOnly: true,
        submenuId: "submenu-system",
        submenu: [
          { href: "/admin/activity-logs", label: "Activity Logs", icon: faHistory, permission: "security.view_logs" },
          { href: "/admin/cache-manager", label: "Cache Manager", icon: faBolt, permission: "settings.maintenance_mode" },
        ],
      },
    ],
  },

  {
    title: "Account",
    permission: null,
    links: [
      { href: "/admin/my-profile", label: "My Profile", icon: faUser, permission: null },
      { href: "/admin/staff-app", label: "Staff App", icon: faMobileAlt, permission: null },
      { href: "/api/auth/logout", label: "Logout", icon: faSignOutAlt, permission: null, isLogout: true },
    ],
  },
];

/** Reads a dotted permission path (e.g. "ecommerce.manage_products") out of the
 *  user's nested permissions JSON — mirrors PHP's `$permissions['ecommerce']['manage_products']`. */
export function hasPermission(
  permissions: Record<string, Record<string, boolean>> | null | undefined,
  path: NavPermissionPath
): boolean {
  if (path === null) return true;
  if (!permissions) return false;

  if (path === "reports.any") return !!permissions.ecommerce?.manage_orders || !!permissions.ecommerce?.manage_billing;
  if (path === "offers.any") return !!permissions.ecommerce?.manage_products || !!permissions.ecommerce?.manage_coupons;

  if (path === "blogs.any") {
    const blogsAny = Object.values(permissions.blogs ?? {}).some(Boolean);
    const analyticsBasic = !!permissions.analytics?.view_basic;
    return blogsAny || analyticsBasic;
  }

  const [group, key] = path.split(".");
  return !!permissions[group]?.[key];
}
