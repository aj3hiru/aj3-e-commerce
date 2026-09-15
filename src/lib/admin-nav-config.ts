// ════════════════════════════════════════════════════════════════════════
// Verified 1:1 against admin/components/sidebar-nav.php — every section,
// submenu, icon, and permission gate below matches the original PHP file.
// Do not reorder, merge, or drop any entry without checking the source again.
// ════════════════════════════════════════════════════════════════════════

export type NavPermissionPath =
  | "ecommerce.manage_billing"
  | "ecommerce.manage_products"
  | "ecommerce.manage_categories"
  | "ecommerce.manage_orders"
  | "ecommerce.manage_customers"
  | "ecommerce.manage_coupons"
  | "ecommerce.manage_payment"
  | "ecommerce.manage_credits"
  | "files.access_file_manager"
  | "pages.create"
  | "push_notifications.send"
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
  icon: string; // lucide-react icon name, mapped in the component
  permission: NavPermissionPath;
  /** Used to compute the "active" state beyond a simple pathname match (e.g. orders.php?type=Pending) */
  matchQuery?: { key: string; value: string };
}

export interface NavParent extends NavLink {
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
  // 1. DASHBOARD
  {
    title: "Main",
    permission: null,
    links: [
      { href: "/admin/dashboard", label: "Dashboard", icon: "Home", permission: null },
    ],
  },

  // 2. BILLING
  {
    title: "Billing",
    permission: "ecommerce.manage_billing",
    links: [
      { href: "/admin/ecommerce/billing", label: "Billing / POS", icon: "Cog" /* fa-cash-register */, permission: "ecommerce.manage_billing" },
      { href: "/admin/ecommerce/sales-history", label: "Sales History", icon: "History", permission: "ecommerce.manage_billing" },
    ],
  },

  // 3. ALL PRODUCTS (default OPEN submenu)
  {
    title: "Manage Products",
    permission: "ecommerce.manage_products",
    links: [
      {
        href: "/admin/ecommerce/products",
        label: "All Products",
        icon: "Boxes",
        permission: "ecommerce.manage_products",
        defaultOpen: true,
        submenuId: "submenu-products",
        submenu: [
          { href: "/admin/ecommerce/products/add", label: "Add Product", icon: "PlusSquare", permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/brands", label: "Brands", icon: "Copyright", permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/stock-out-products", label: "Stock Out Products", icon: "PackageOpen", permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/campaign-offer", label: "Campaign Offer", icon: "Percent", permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/csv-import-export", label: "CSV Import & Export", icon: "FileSpreadsheet", permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/product-reviews", label: "Product Reviews", icon: "StarHalf", permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/barcode-print", label: "Print Barcodes", icon: "Barcode", permission: "ecommerce.manage_products" },
          { href: "/admin/ecommerce/product-tags", label: "Badge Tags & Item Types", icon: "Tags", permission: "ecommerce.manage_products" },
        ],
      },
    ],
  },

  // 4. MANAGE CATEGORY
  {
    title: "Manage Category",
    permission: "ecommerce.manage_categories",
    links: [
      {
        href: "/admin/ecommerce/categories",
        label: "Categories",
        icon: "List",
        permission: "ecommerce.manage_categories",
        submenuId: "submenu-categories",
        submenu: [
          { href: "/admin/ecommerce/subcategories", label: "Sub Categories", icon: "ListTree", permission: "ecommerce.manage_categories" },
        ],
      },
    ],
  },

  // 5. MANAGE ORDERS
  {
    title: "Manage Orders",
    permission: "ecommerce.manage_orders",
    links: [
      {
        href: "/admin/ecommerce/orders",
        label: "All Orders",
        icon: "Receipt",
        permission: "ecommerce.manage_orders",
        submenuId: "submenu-orders",
        submenu: [
          { href: "/admin/ecommerce/orders?type=Pending", label: "Pending Orders", icon: "Hourglass", permission: "ecommerce.manage_orders", matchQuery: { key: "type", value: "Pending" } },
          { href: "/admin/ecommerce/orders?type=In+Progress", label: "Progress Orders", icon: "TruckElectric" /* fa-truck-loading */, permission: "ecommerce.manage_orders", matchQuery: { key: "type", value: "In Progress" } },
          { href: "/admin/ecommerce/orders?type=Delivered", label: "Delivered Orders", icon: "Truck", permission: "ecommerce.manage_orders", matchQuery: { key: "type", value: "Delivered" } },
          { href: "/admin/ecommerce/orders?type=Canceled", label: "Canceled Orders", icon: "Ban", permission: "ecommerce.manage_orders", matchQuery: { key: "type", value: "Canceled" } },
        ],
      },
    ],
  },

  // 5b. ANALYTICS (new ecommerce feature — product/sales analytics, not a blog port)
  {
    title: "Analytics",
    permission: "ecommerce.manage_orders",
    links: [
      { href: "/admin/ecommerce/analytics", label: "Sales Analytics", icon: "LineChart", permission: "ecommerce.manage_orders" },
    ],
  },

  // 6. CUSTOMERS
  {
    title: "Customers",
    permission: "ecommerce.manage_customers",
    links: [
      { href: "/admin/ecommerce/customers", label: "Customer List", icon: "Users", permission: "ecommerce.manage_customers" },
    ],
  },

  // 7. DISCOUNTS
  {
    title: "Discounts",
    permission: "ecommerce.manage_coupons",
    links: [
      { href: "/admin/ecommerce/coupons", label: "Set Coupons", icon: "Percent", permission: "ecommerce.manage_coupons" },
    ],
  },

  // 8. SETTINGS
  {
    title: "Settings",
    permission: "ecommerce.manage_payment",
    links: [
      { href: "/admin/ecommerce/payment-settings", label: "Payment", icon: "CreditCard", permission: "ecommerce.manage_payment" },
      { href: "/admin/ecommerce/business-settings", label: "Business Setting", icon: "Building2", permission: "ecommerce.manage_payment" },
      { href: "/admin/ecommerce/homepage-settings", label: "Homepage Settings", icon: "Home", permission: "ecommerce.manage_payment" },
      { href: "/admin/ecommerce/tax-settings", label: "GST / Tax Settings", icon: "Receipt", permission: "ecommerce.manage_products" },
    ],
  },

  // 8b. DUE
  {
    title: "Due",
    permission: "ecommerce.manage_credits",
    links: [
      { href: "/admin/ecommerce/due", label: "Due", icon: "HandCoins", permission: "ecommerce.manage_credits" },
    ],
  },

  // 9. MEDIA
  {
    title: "Media",
    permission: "files.access_file_manager",
    links: [
      { href: "/admin/file-manager", label: "File Manager", icon: "Images", permission: "files.access_file_manager" },
    ],
  },

  // 9b. PAGES
  {
    title: "Pages",
    permission: "pages.create",
    links: [
      { href: "/admin/pages", label: "Static Pages", icon: "FileText", permission: "pages.create" },
    ],
  },

  // 10. MARKETING
  {
    title: "Marketing",
    permission: "push_notifications.send",
    links: [
      { href: "/push-notifications/push-manager", label: "Push Notifications", icon: "Bell", permission: "push_notifications.send" },
    ],
  },

  // 11. BLOG (collapsible group, closed by default unless inside /admin/blog/*)
  {
    title: "Blog",
    collapsibleGroup: true,
    submenuId: "submenu-blog",
    permission: "blogs.any",
    links: [
      { href: "/admin/blog/dashboard", label: "Blog Dashboard", icon: "LayoutDashboard", permission: "blogs.any" },
      { href: "/admin/blog/blogs-manager", label: "Blog Posts", icon: "Newspaper", permission: "blogs.any" },
      { href: "/admin/blog/categories-manager", label: "Category Manager", icon: "List", permission: "blogs.manage_categories" },
      { href: "/admin/blog/tag-manager", label: "Tag Manager", icon: "Tags", permission: "blogs.manage_tags" },
      { href: "/admin/blog/comments-manager", label: "Comments", icon: "MessageSquare", permission: "blogs.manage_comments" },
      { href: "/admin/blog/analytics", label: "Analytics", icon: "LineChart", permission: "analytics.view_basic" },
      { href: "/admin/blog/ads-manager", label: "Ads Manager", icon: "Megaphone", permission: "blogs.any" },
    ],
  },

  // 12. SYSTEM (always last)
  {
    title: "System",
    permission: null,
    links: [
      { href: "/admin/cache-manager", label: "Cache Manager", icon: "Zap", permission: "settings.maintenance_mode" },
      { href: "/admin/activity-logs", label: "Activity Logs", icon: "History", permission: "security.view_logs" },
      { href: "/admin/user-manager", label: "Users Manager", icon: "User", permission: "users.create" },
      { href: "/api/auth/logout", label: "Logout", icon: "LogOut", permission: null },
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

  if (path === "blogs.any") {
    const blogsAny = Object.values(permissions.blogs ?? {}).some(Boolean);
    const analyticsBasic = !!permissions.analytics?.view_basic;
    return blogsAny || analyticsBasic;
  }

  const [group, key] = path.split(".");
  return !!permissions[group]?.[key];
}
