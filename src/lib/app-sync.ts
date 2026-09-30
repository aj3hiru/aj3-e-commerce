import { createHash } from "crypto";
import { getTaxMode } from "@/lib/tax-mode";
import { packLabel } from "@/lib/product-variants-shared";
import { prisma } from "@/lib/db";
import { getBusinessRow } from "@/lib/business-row";
import { campaignSalePrices } from "@/lib/campaign-pricing";
import { roleLabel } from "@/lib/roles";
import { listDeliveryAgents } from "@/lib/order-workflow";
import { normalizePermissions } from "@/lib/permissions";
import { cached } from "@/lib/cache";
import type { AdminSession } from "@/lib/admin-auth";

/**
 * Data the staff app keeps on the device (for offline use), in "sets". The app
 * says which version (hash) of each set it already has; only changed sets are
 * sent back — so edits, new rows and deletions all arrive, and an unchanged
 * sync costs almost nothing. Each set is only sent to roles that may see it.
 */

type Perms = AdminSession["permissions"];
const has = (p: Perms, g: string, k: string) => !!p?.[g]?.[k];
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const DAY = 86_400_000;

export const SET_NAMES = ["settings", "products", "categories", "brands", "customers", "coupons", "orders", "dues", "deliveries", "agents", "staff"] as const;
export type SetName = (typeof SET_NAMES)[number];

export function allowedSets(session: AdminSession): SetName[] {
  const p = session.permissions;
  const billing = has(p, "ecommerce", "manage_billing");
  const products = has(p, "ecommerce", "manage_products");
  const ordersView = has(p, "orders", "view");
  const out: SetName[] = ["settings"];
  if (billing || products || ordersView || has(p, "ecommerce", "manage_categories")) out.push("products", "categories", "brands");
  if (billing || ordersView || has(p, "ecommerce", "manage_customers") || has(p, "ecommerce", "manage_credits")) out.push("customers");
  if (billing || has(p, "ecommerce", "manage_coupons")) out.push("coupons");
  if (billing || ordersView) out.push("orders");
  if (billing || has(p, "ecommerce", "manage_credits") || has(p, "ecommerce", "manage_customers")) out.push("dues");
  if (has(p, "delivery", "deliver")) out.push("deliveries");
  if (has(p, "orders", "assign_delivery")) out.push("agents");
  if (has(p, "users", "create")) out.push("staff");
  return out;
}

/** How many permissions are switched on (the Users Manager's "Permissions summary"). */
function countPerms(v: unknown): number {
  if (v === true) return 1;
  if (!v || typeof v !== "object") return 0;
  return Object.values(v as Record<string, unknown>).reduce<number>((n, x) => n + countPerms(x), 0);
}
const staffName = (u: { username: string; firstName: string | null; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username;

async function buildSettings() {
  const [b, taxMode, tags, pays] = await Promise.all([
    getBusinessRow(), getTaxMode(),
    prisma.ecomProductTag.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, label: true, color: true, tagGroup: true } }),
    prisma.ecomPaymentSettings.findMany({ select: { methodKey: true, name: true } }),
  ]);
  const phones = Array.isArray(b?.contactNumbers) ? (b!.contactNumbers as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()) : b?.phone ? [b.phone] : [];
  return {
    businessName: b?.businessName ?? "My Store", tagline: b?.tagline ?? null, logo: b?.logo ?? null, address: b?.address ?? null, phones,
    email: b?.email ?? null, gstin: b?.showGstinOnInvoice ? b?.gstin ?? null : null,
    printerFormat: b?.printerFormat ?? "thermal_80", posPrintMode: b?.posPrintMode ?? "both",
    // Billing keyboard keys (Business Settings → POS Shortcuts)
    shortcutCompleteSale: b?.shortcutCompleteSale ?? "F2", shortcutPrint: b?.shortcutPrint ?? "F3", shortcutNewSale: b?.shortcutNewSale ?? "F4",
    paymentMethods: ["Cash", "UPI", "Card", "Other"],
    // Storefront orders keep the method key ("cod"); the website shows its name ("Cash On Delivery").
    paymentNames: Object.fromEntries(pays.map((m) => [m.methodKey, m.name])),
    pricesIncludeTax: taxMode.pricesIncludeTax,
    // Products table "Type" (badge, with its colour) and "Item Type" columns, as on the website.
    badges: tags.filter((t) => t.tagGroup === "badge").map((t) => ({ slug: t.slug, label: t.label, color: t.color })),
    itemTypes: tags.filter((t) => t.tagGroup === "item_type").map((t) => ({ slug: t.slug, label: t.label })),
  };
}

async function buildProducts() {
  const rows = await prisma.ecomProduct.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, sku: true, barcode: true, hsnCode: true, price: true, salePrice: true, gstRate: true, stockQty: true, unit: true, image: true,
      categoryId: true, subcategoryId: true, brandId: true, status: true, productType: true, updatedAt: true, quantity: true, variantGroup: true,
      badgeTag: true, itemType: true, createdAt: true,
      sizes: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, label: true, mrp: true, price: true, stockQty: true, isDefault: true } } },
  });
  const campaign = await campaignSalePrices(rows.filter((r) => r.status === "active"));
  return rows.map((r) => ({
    id: r.id, name: r.name, slug: r.slug, sku: r.sku, barcode: r.barcode, hsn: r.hsnCode, price: Number(r.price),
    salePrice: campaign.get(r.id) ?? num(r.salePrice), gstRate: Number(r.gstRate), stock: r.stockQty, unit: r.unit, image: r.image,
    quantity: num(r.quantity), variantGroup: r.variantGroup, pack: packLabel(num(r.quantity), r.unit),
    sizes: r.sizes.map((z) => ({ id: z.id, label: z.label, mrp: Number(z.mrp), price: num(z.price), stock: z.stockQty, isDefault: z.isDefault })),
    categoryId: r.categoryId, subcategoryId: r.subcategoryId, brandId: r.brandId, status: r.status, type: r.productType, updatedAt: iso(r.updatedAt),
    badgeTag: r.badgeTag, itemType: r.itemType, createdAt: iso(r.createdAt),
  }));
}

async function buildCustomers() {
  const [rows, open, bought] = await Promise.all([
    prisma.ecomCustomer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, email: true, customerType: true, status: true, address: true, avatar: true, createdAt: true, password: true, _count: { select: { addresses: true } } },
    }),
    prisma.ecomCredit.groupBy({ by: ["customerId"], where: { status: { not: "paid" } }, _sum: { amount: true, amountPaid: true } }),
    // All-time orders and spend per customer (the website's Customers table shows both).
    prisma.ecomOrder.groupBy({ by: ["customerId"], where: { customerId: { not: null }, orderStatus: { not: "Canceled" } }, _count: { _all: true }, _sum: { totalAmount: true }, _max: { createdAt: true } }),
  ]);
  const due = new Map(open.map((d) => [d.customerId, Math.max(0, Number(d._sum.amount ?? 0) - Number(d._sum.amountPaid ?? 0))]));
  const spend = new Map(bought.map((b) => [b.customerId, { orders: b._count._all, spent: Math.round(Number(b._sum.totalAmount ?? 0) * 100) / 100, last: b._max.createdAt }]));
  return rows.map((c) => ({
    id: c.id, name: c.name, phone: c.phone, email: c.email, type: c.customerType, status: c.status, address: c.address, avatar: c.avatar, since: iso(c.createdAt),
    due: Math.round((due.get(c.id) ?? 0) * 100) / 100, orders: spend.get(c.id)?.orders ?? 0, spent: spend.get(c.id)?.spent ?? 0,
    // Website Customers table: login methods, saved addresses, "last order …".
    hasPassword: !!c.password, addresses: c._count.addresses, lastOrderAt: iso(spend.get(c.id)?.last ?? null),
  }));
}

const ORDER_SELECT = {
  id: true, orderNumber: true, orderType: true, orderStatus: true, paymentStatus: true, paymentMethod: true, customerId: true, customerName: true, customerEmail: true, isGuest: true,
  totalAmount: true, subtotalAmount: true, discountAmount: true, gstAmount: true, deliveryCharge: true, paidAmount: true, shippingAddress: true, shippingLat: true, shippingLng: true,
  deliveryAgentId: true, assignedAt: true, deliveredAt: true, cancelReason: true, createdAt: true,
  customer: { select: { phone: true } },
  items: { select: { id: true, productId: true, productName: true, qty: true, price: true, gstRate: true, gstAmount: true } },
  credits: { select: { amount: true, amountPaid: true, status: true } },
  events: { orderBy: { id: "desc" as const }, take: 1, select: { id: true } },
  payments: { select: { paymentMethod: true, amount: true, createdAt: true } },
} as const;

type OrderRow = Awaited<ReturnType<typeof prisma.ecomOrder.findMany<{ select: typeof ORDER_SELECT }>>>[number];
function orderOut(o: OrderRow) {
  const due = o.credits.reduce((s, c) => s + (c.status === "paid" ? 0 : Math.max(0, Number(c.amount) - Number(c.amountPaid))), 0);
  return {
    id: o.id, number: o.orderNumber, type: o.orderType, status: o.orderStatus, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod,
    customerId: o.customerId, customer: o.customerName, email: o.customerEmail, guest: o.isGuest, phone: o.customer?.phone ?? null, total: Number(o.totalAmount), subtotal: Number(o.subtotalAmount),
    discount: Number(o.discountAmount), gst: Number(o.gstAmount), delivery: Number(o.deliveryCharge), paid: Number(o.paidAmount), due: Math.round(due * 100) / 100,
    address: o.shippingAddress, lat: num(o.shippingLat), lng: num(o.shippingLng), agentId: o.deliveryAgentId, assignedAt: iso(o.assignedAt),
    deliveredAt: iso(o.deliveredAt), cancelReason: o.cancelReason, createdAt: o.createdAt.toISOString(), rev: o.events[0]?.id ?? 0,
    items: o.items.map((i) => ({ id: i.id, productId: i.productId, name: i.productName, qty: i.qty, price: Number(i.price), gstRate: Number(i.gstRate), gst: Number(i.gstAmount) })),
    pays: o.payments.map((p) => ({ method: p.paymentMethod, amount: Number(p.amount), at: p.createdAt.toISOString() })),
  };
}

async function buildOrders() {
  const since = new Date(Date.now() - 60 * DAY);
  const rows = await prisma.ecomOrder.findMany({
    where: { OR: [{ createdAt: { gte: since } }, { orderStatus: { notIn: ["Delivered", "Canceled"] } }, { credits: { some: { status: { not: "paid" } } } }] },
    orderBy: { id: "desc" }, take: 3000, select: ORDER_SELECT,
  });
  return rows.map(orderOut);
}

async function buildDeliveries(userId: number) {
  const rows = await prisma.ecomOrder.findMany({
    where: { deliveryAgentId: userId, OR: [{ orderStatus: { notIn: ["Delivered", "Canceled"] } }, { deliveredAt: { gte: new Date(Date.now() - 14 * DAY) } }, { assignedAt: { gte: new Date(Date.now() - 14 * DAY) } }] },
    orderBy: { id: "desc" }, take: 500, select: ORDER_SELECT,
  });
  return rows.map(orderOut);
}

const DUE_SELECT = {
  id: true, orderId: true, customerId: true, customerName: true, customerPhone: true, amount: true, amountPaid: true, promisedDate: true, status: true, createdAt: true,
  order: { select: { orderNumber: true, orderType: true, items: { select: { productId: true, productName: true } } } },
  payments: { orderBy: { createdAt: "asc" as const }, select: { receiptNumber: true, amount: true, paymentMethod: true, createdAt: true, createdBy: true } },
} as const;

type DueRow = Awaited<ReturnType<typeof prisma.ecomCredit.findMany<{ select: typeof DUE_SELECT }>>>[number];
/** One due as the app's Due page shows it (the website's Due table), with its payment receipts. */
export function dueOut(c: DueRow, staff: Map<number, string>) {
  return {
    id: c.id, orderId: c.orderId, orderNumber: c.order.orderNumber, orderType: c.order.orderType, customerId: c.customerId, customer: c.customerName, phone: c.customerPhone,
    amount: Number(c.amount), paid: Number(c.amountPaid), balance: Math.round(Math.max(0, Number(c.amount) - Number(c.amountPaid)) * 100) / 100,
    promised: iso(c.promisedDate), status: c.status, createdAt: c.createdAt.toISOString(),
    products: c.order.items.map((i) => ({ id: i.productId, name: i.productName })),
    payments: c.payments.map((p) => ({ receipt: p.receiptNumber, amount: Number(p.amount), method: p.paymentMethod, at: p.createdAt.toISOString(), by: p.createdBy ? staff.get(p.createdBy) ?? null : null })),
  };
}

export async function staffNames() {
  const users = await prisma.user.findMany({ select: { id: true, username: true, firstName: true, lastName: true } });
  return new Map(users.map((u) => [u.id, staffName(u)]));
}

async function buildDues() {
  const [rows, staff] = await Promise.all([
    prisma.ecomCredit.findMany({ where: { status: { not: "paid" } }, orderBy: { createdAt: "desc" }, take: 5000, select: DUE_SELECT }),
    staffNames(),
  ]);
  return rows.map((c) => dueOut(c, staff));
}

/** Dues paid off in the last 180 days — the Due page's "Fully paid" / "All dues" (page data, not the dues set). */
export async function paidDues() {
  const [rows, staff] = await Promise.all([
    prisma.ecomCredit.findMany({ where: { status: "paid", createdAt: { gte: new Date(Date.now() - 180 * DAY) } }, orderBy: { createdAt: "desc" }, take: 5000, select: DUE_SELECT }),
    staffNames(),
  ]);
  return rows.map((c) => dueOut(c, staff));
}

/** Tables each set is built from — any write to them rebuilds the set (lib/cache.ts). */
const DEPS: Record<SetName, string[]> = {
  settings: ["EcomBusinessSettings", "EcomProductTag", "EcomPaymentSettings"],
  products: ["EcomProduct", "EcomProductSize", "EcomCampaign", "EcomCampaignTarget"],
  categories: ["EcomCategory"],
  brands: ["EcomBrand"],
  customers: ["EcomCustomer", "EcomCredit", "EcomCreditPayment", "EcomOrder", "EcomCustomerAddress"],
  coupons: ["EcomCoupon"],
  orders: ["EcomOrder", "EcomOrderItem", "EcomOrderEvent", "EcomOrderPayment", "EcomCredit", "EcomCreditPayment", "EcomCustomer"],
  dues: ["EcomCredit", "EcomCreditPayment", "EcomOrder", "EcomOrderItem"],
  deliveries: ["EcomOrder", "EcomOrderItem", "EcomOrderEvent", "EcomOrderPayment", "EcomCustomer"],
  agents: ["User"],
  staff: ["User"],
};

/** A set built once and shared by every device until its data changes (60 s at most). */
function build(name: SetName, session: AdminSession): Promise<unknown> {
  // staff: people who may change permissions also get each person's permissions, so they share a separate copy.
  const key = name === "deliveries" ? `app-set:deliveries:${session.userId}`
    : name === "staff" && has(session.permissions, "users", "manage_permissions") ? "app-set:staff:perms"
    : `app-set:${name}`;
  return cached(key, DEPS[name], 60_000, () => buildFresh(name, session));
}

async function buildFresh(name: SetName, session: AdminSession): Promise<unknown> {
  switch (name) {
    case "settings": return buildSettings();
    case "products": return buildProducts();
    case "categories": return prisma.ecomCategory.findMany({ orderBy: [{ serial: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true, image: true, status: true, serial: true, metaKeywords: true, metaDescription: true, createdAt: true, updatedAt: true } });
    case "brands": return prisma.ecomBrand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, logo: true, status: true } });
    case "customers": return buildCustomers();
    // Same list as the website's billing screen (every active coupon; the checkout checks the rest).
    case "coupons": return (await prisma.ecomCoupon.findMany({ where: { status: "active" }, select: { id: true, code: true, title: true, discountType: true, discountValue: true, appliesTo: true, productId: true, categoryId: true, subcategoryId: true, numberOfTimes: true, usedCount: true, startsAt: true, endsAt: true, isPaused: true } }))
      .map((c) => ({ ...c, discountValue: Number(c.discountValue), startsAt: iso(c.startsAt), endsAt: iso(c.endsAt) }));
    case "orders": return buildOrders();
    case "dues": return buildDues();
    case "deliveries": return buildDeliveries(session.userId);
    // Same list and names as the website's order pages (listDeliveryAgents): anyone active who delivers, by username.
    case "agents": {
      const [list, users] = await Promise.all([listDeliveryAgents(), prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, username: true, phone: true } })]);
      const byId = new Map(users.map((u) => [u.id, u]));
      return list.map((a) => ({ id: a.id, name: a.name, fullName: byId.get(a.id) ? staffName(byId.get(a.id)!) : a.name, phone: byId.get(a.id)?.phone ?? null }));
    }
    case "staff": return (await prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true, firstName: true, lastName: true, email: true, phone: true, role: true, status: true, avatar: true, createdAt: true, permissions: true } }))
      .map((u) => ({
        id: u.id, username: u.username, name: staffName(u), firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, role: u.role, roleLabel: roleLabel(u.role), status: u.status,
        avatar: u.avatar, since: iso(u.createdAt), permCount: countPerms(u.permissions),
        // Each person's permissions, for the editor's "Advanced Access" — only to someone allowed to change them.
        ...(has(session.permissions, "users", "manage_permissions") ? { permissions: normalizePermissions(u.permissions, u.role) } : {}),
      }));
  }
}

const hashOf = (data: unknown) => createHash("sha1").update(JSON.stringify(data)).digest("base64url").slice(0, 22);

/** The sets this user may have, sending only those whose hash differs from what the app holds. */
export async function syncSets(session: AdminSession, have: Record<string, string>, only?: string[]) {
  const names = allowedSets(session).filter((n) => !only?.length || only.includes(n));
  const built = await Promise.all(names.map(async (n) => [n, await build(n, session)] as const));
  const sets: Record<string, { hash: string; data?: unknown }> = {};
  for (const [n, data] of built) {
    const hash = hashOf(data);
    sets[n] = have[n] === hash ? { hash } : { hash, data };
  }
  return { sets, allowed: allowedSets(session) };
}
