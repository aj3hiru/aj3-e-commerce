/**
 * Staff roles for the store. Each role pre-fills a permission set (see
 * STORE_ROLE_PRESETS in lib/permissions.ts); the admin can still tick or
 * untick any permission per user ("advanced permissions").
 */
export interface RoleDef { id: string; label: string; description: string; color: string }

export const STAFF_ROLES: RoleDef[] = [
  { id: "admin", label: "Admin", description: "Full access to everything, including users and settings.", color: "#7c3aed" },
  { id: "manager", label: "Store Manager", description: "Runs the store: products, orders, deliveries, billing, customers, marketing and reports. No user or site settings.", color: "#2563eb" },
  { id: "order_manager", label: "Order Manager", description: "Handles online orders: accept or reject, change status, assign delivery agents, mark payments.", color: "#0891b2" },
  { id: "delivery_agent", label: "Delivery Agent", description: "Sees only the orders assigned to them: navigate, call, collect cash, mark delivered.", color: "#16a34a" },
  { id: "cashier", label: "Billing / Cashier", description: "Counter billing (POS), sales history, due collection and customers.", color: "#ea580c" },
  { id: "catalog_manager", label: "Product Manager", description: "Adds and edits products, categories, brands, stock and images.", color: "#db2777" },
  { id: "marketing", label: "Marketing", description: "Store customizer, static pages, offers & coupons and push notifications.", color: "#9333ea" },
];

/** Roles from the old blog, kept only so existing accounts still show a name until they are given a store role. */
const LEGACY_ROLES: Record<string, string> = { editor: "Editor (old)", author: "Author (old)" };

export const STAFF_ROLE_IDS = STAFF_ROLES.map((r) => r.id);
export const roleLabel = (id: string) => STAFF_ROLES.find((r) => r.id === id)?.label ?? LEGACY_ROLES[id] ?? id;
export const isStaffRole = (id: unknown): id is string => typeof id === "string" && STAFF_ROLE_IDS.includes(id);
