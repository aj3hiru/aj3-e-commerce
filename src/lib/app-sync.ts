import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { getBusinessRow } from "@/lib/business-row";
import { campaignSalePrices } from "@/lib/campaign-pricing";
import { roleLabel } from "@/lib/roles";
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

const staffName = (u: { username: string; firstName: string | null; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username;

async function buildSettings() {
  const b = await getBusinessRow();
  const phones = Array.isArray(b?.contactNumbers) ? (b!.contactNumbers as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()) : b?.phone ? [b.phone] : [];
  return {
    businessName: b?.businessName ?? "My Store", tagline: b?.tagline ?? null, logo: b?.logo ?? null, address: b?.address ?? null, phones,
    email: b?.email ?? null, gstin: b?.showGstinOnInvoice ? b?.gstin ?? null : null,
    printerFormat: b?.printerFormat ?? "thermal_80", posPrintMode: b?.posPrintMode ?? "both",
    paymentMethods: ["Cash", "UPI", "Card", "Other"],
  };
}

async function buildProducts() {
  const rows = await prisma.ecomProduct.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true, barcode: true, hsnCode: true, price: true, salePrice: true, gstRate: true, stockQty: true, unit: true, image: true,
      categoryId: true, brandId: true, status: true, productType: true, updatedAt: true },
  });
  const campaign = await campaignSalePrices(rows.filter((r) => r.status === "active"));
  return rows.map((r) => ({
    id: r.id, name: r.name, sku: r.sku, barcode: r.barcode, hsn: r.hsnCode, price: Number(r.price),
    salePrice: campaign.get(r.id) ?? num(r.salePrice), gstRate: Number(r.gstRate), stock: r.stockQty, unit: r.unit, image: r.image,
    categoryId: r.categoryId, brandId: r.brandId, status: r.status, type: r.productType, updatedAt: iso(r.updatedAt),
  }));
}

async function buildCustomers() {
  const [rows, open] = await Promise.all([
    prisma.ecomCustomer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, email: true, customerType: true, status: true, address: true, avatar: true, createdAt: true } }),
    prisma.ecomCredit.groupBy({ by: ["customerId"], where: { status: { not: "paid" } }, _sum: { amount: true, amountPaid: true } }),
  ]);
  const due = new Map(open.map((d) => [d.customerId, Math.max(0, Number(d._sum.amount ?? 0) - Number(d._sum.amountPaid ?? 0))]));
  return rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, type: c.customerType, status: c.status, address: c.address, avatar: c.avatar, since: iso(c.createdAt), due: Math.round((due.get(c.id) ?? 0) * 100) / 100 }));
}

const ORDER_SELECT = {
  id: true, orderNumber: true, orderType: true, orderStatus: true, paymentStatus: true, paymentMethod: true, customerId: true, customerName: true,
  totalAmount: true, subtotalAmount: true, discountAmount: true, gstAmount: true, paidAmount: true, shippingAddress: true, shippingLat: true, shippingLng: true,
  deliveryAgentId: true, assignedAt: true, deliveredAt: true, cancelReason: true, createdAt: true,
  customer: { select: { phone: true } },
  items: { select: { productId: true, productName: true, qty: true, price: true, gstRate: true, gstAmount: true } },
  credits: { select: { amount: true, amountPaid: true, status: true } },
  events: { orderBy: { id: "desc" as const }, take: 1, select: { id: true } },
} as const;

type OrderRow = Awaited<ReturnType<typeof prisma.ecomOrder.findMany<{ select: typeof ORDER_SELECT }>>>[number];
function orderOut(o: OrderRow) {
  const due = o.credits.reduce((s, c) => s + (c.status === "paid" ? 0 : Math.max(0, Number(c.amount) - Number(c.amountPaid))), 0);
  return {
    id: o.id, number: o.orderNumber, type: o.orderType, status: o.orderStatus, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod,
    customerId: o.customerId, customer: o.customerName, phone: o.customer?.phone ?? null, total: Number(o.totalAmount), subtotal: Number(o.subtotalAmount),
    discount: Number(o.discountAmount), gst: Number(o.gstAmount), paid: Number(o.paidAmount), due: Math.round(due * 100) / 100,
    address: o.shippingAddress, lat: num(o.shippingLat), lng: num(o.shippingLng), agentId: o.deliveryAgentId, assignedAt: iso(o.assignedAt),
    deliveredAt: iso(o.deliveredAt), cancelReason: o.cancelReason, createdAt: o.createdAt.toISOString(), rev: o.events[0]?.id ?? 0,
    items: o.items.map((i) => ({ productId: i.productId, name: i.productName, qty: i.qty, price: Number(i.price), gstRate: Number(i.gstRate), gst: Number(i.gstAmount) })),
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

async function buildDues() {
  const rows = await prisma.ecomCredit.findMany({
    where: { status: { not: "paid" } }, orderBy: { createdAt: "desc" }, take: 5000,
    select: { id: true, orderId: true, customerId: true, customerName: true, customerPhone: true, amount: true, amountPaid: true, promisedDate: true, status: true, createdAt: true, order: { select: { orderNumber: true } } },
  });
  return rows.map((c) => ({
    id: c.id, orderId: c.orderId, orderNumber: c.order.orderNumber, customerId: c.customerId, customer: c.customerName, phone: c.customerPhone,
    amount: Number(c.amount), paid: Number(c.amountPaid), balance: Math.round(Math.max(0, Number(c.amount) - Number(c.amountPaid)) * 100) / 100,
    promised: iso(c.promisedDate), status: c.status, createdAt: c.createdAt.toISOString(),
  }));
}

/** Tables each set is built from — any write to them rebuilds the set (lib/cache.ts). */
const DEPS: Record<SetName, string[]> = {
  settings: ["EcomBusinessSettings"],
  products: ["EcomProduct", "EcomCampaign", "EcomCampaignTarget"],
  categories: ["EcomCategory"],
  brands: ["EcomBrand"],
  customers: ["EcomCustomer", "EcomCredit", "EcomCreditPayment"],
  coupons: ["EcomCoupon"],
  orders: ["EcomOrder", "EcomOrderItem", "EcomOrderEvent", "EcomCredit", "EcomCreditPayment", "EcomCustomer"],
  dues: ["EcomCredit", "EcomCreditPayment"],
  deliveries: ["EcomOrder", "EcomOrderItem", "EcomOrderEvent", "EcomCustomer"],
  agents: ["User"],
  staff: ["User"],
};

/** A set built once and shared by every device until its data changes (60 s at most). */
function build(name: SetName, session: AdminSession): Promise<unknown> {
  const key = name === "deliveries" ? `app-set:deliveries:${session.userId}` : `app-set:${name}`;
  return cached(key, DEPS[name], 60_000, () => buildFresh(name, session));
}

async function buildFresh(name: SetName, session: AdminSession): Promise<unknown> {
  switch (name) {
    case "settings": return buildSettings();
    case "products": return buildProducts();
    case "categories": return prisma.ecomCategory.findMany({ orderBy: [{ serial: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true, image: true, status: true, serial: true, metaKeywords: true, metaDescription: true } });
    case "brands": return prisma.ecomBrand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, logo: true, status: true } });
    case "customers": return buildCustomers();
    case "coupons": return (await prisma.ecomCoupon.findMany({ where: { status: "active", isPaused: false }, select: { id: true, code: true, title: true, discountType: true, discountValue: true, appliesTo: true, productId: true, categoryId: true, numberOfTimes: true, usedCount: true, startsAt: true, endsAt: true } }))
      .map((c) => ({ ...c, discountValue: Number(c.discountValue), startsAt: iso(c.startsAt), endsAt: iso(c.endsAt) }));
    case "orders": return buildOrders();
    case "dues": return buildDues();
    case "deliveries": return buildDeliveries(session.userId);
    case "agents": return (await prisma.user.findMany({ where: { status: "active", OR: [{ role: "delivery_agent" }] }, orderBy: { username: "asc" }, select: { id: true, username: true, firstName: true, lastName: true, phone: true } }))
      .map((u) => ({ id: u.id, name: staffName(u), phone: u.phone }));
    case "staff": return (await prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true, firstName: true, lastName: true, email: true, phone: true, role: true, status: true, avatar: true, createdAt: true } }))
      .map((u) => ({ id: u.id, username: u.username, name: staffName(u), email: u.email, phone: u.phone, role: u.role, roleLabel: roleLabel(u.role), status: u.status, avatar: u.avatar, since: iso(u.createdAt) }));
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
