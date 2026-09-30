import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appSession } from "@/lib/app-api";
import { hasPermission } from "@/lib/admin-auth";
import { withApiErrors } from "@/lib/api-errors";
import { getTags2Data, parseTagRange } from "@/lib/product-tags2";
import { getReviews2Data } from "@/lib/reviews2";
import { getCampaigns2Data, parseRange } from "@/lib/campaigns2";
import { getSiteFiles } from "@/lib/file-manager2";
import { getCacheStats } from "@/lib/cache-manager2";
import { getCampaignHistory } from "@/lib/push-manager2";
import { getPushSettings, keyFingerprint } from "@/lib/push-settings";
import { BROWSER_LABEL, browserOf, subscriberBreakdown } from "@/lib/push-subscriptions";
import { listBackups } from "@/lib/backup";
import { getDeliverySettings } from "@/lib/delivery-charge";
import { getTaxMode } from "@/lib/tax-mode";
import { getDraftHome, hasUnpublished } from "@/lib/home-config";
import { getDraftProductPage } from "@/lib/product-page-config";
import { getStorefrontConfig } from "@/lib/storefront-config";
import { getShopHeaderSettings } from "@/lib/header-settings";
import { loadDeliveryHistory } from "@/lib/delivery-history";
import { getCouponActivity } from "@/lib/coupons2-activity";
import { paidDues } from "@/lib/app-sync";
import { getInvoiceSetup } from "@/lib/invoice-settings";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { getAuthSettings } from "@/lib/auth-settings";

export const dynamic = "force-dynamic";

const ymd = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * Data for the staff app's own pages (the website's admin pages, rebuilt in
 * the app). The app keeps the last answer on the device, so each page also
 * opens offline; changes go through the website's own save APIs.
 */
async function handleGET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  const p = s.permissions;
  const name = (await params).name;
  const deny = () => NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  const ok = (data: unknown) => NextResponse.json({ success: true, at: new Date().toISOString(), data }, { headers: { "Cache-Control": "no-store" } });
  const yearAgo = ymd(new Date(Date.now() - 365 * 86_400_000));

  switch (name) {
    case "brands": {
      if (!hasPermission(p, "ecommerce", "manage_products")) return deny();
      const rows = await prisma.ecomBrand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, logo: true, isPopular: true, status: true, _count: { select: { products: true } } } });
      return ok(rows.map((b) => ({ id: b.id, name: b.name, slug: b.slug, logo: b.logo, isPopular: b.isPopular, status: b.status, products: b._count.products })));
    }
    case "tags": {
      if (!hasPermission(p, "ecommerce", "manage_products")) return deny();
      const d = await getTags2Data(parseTagRange({ from: yearAgo }));
      return ok(d.rows);
    }
    case "reviews": {
      if (!hasPermission(p, "ecommerce", "manage_products")) return deny();
      const d = await getReviews2Data({ from: yearAgo, to: ymd(new Date()) });
      return ok({ rows: d.rows, spread: d.ratingSpread });
    }
    case "campaigns": {
      if (!hasPermission(p, "ecommerce", "manage_products") && !hasPermission(p, "ecommerce", "manage_coupons")) return deny();
      const range = parseRange({});
      const d = await getCampaigns2Data(range);
      return ok({ campaigns: d.campaigns, offers: d.offers, range: d.range, chart: d.chart, from: range.from, to: range.to });
    }
    case "coupons": {
      if (!hasPermission(p, "ecommerce", "manage_coupons")) return deny();
      const rows = await prisma.ecomCoupon.findMany({ orderBy: { id: "desc" }, take: 500, include: { product: { select: { name: true } }, category: { select: { name: true } } } });
      return ok(rows.map((c) => ({
        id: c.id, code: c.code, title: c.title, discountType: c.discountType, discountValue: Number(c.discountValue), appliesTo: c.appliesTo,
        productId: c.productId, categoryId: c.categoryId, target: c.product?.name ?? c.category?.name ?? null, limit: c.numberOfTimes, used: c.usedCount,
        status: c.status, paused: c.isPaused, startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString(),
      })));
    }
    case "coupon_activity": {
      if (!hasPermission(p, "ecommerce", "manage_coupons")) return deny();
      return ok(await getCouponActivity(12));
    }
    case "pages": {
      if (!hasPermission(p, "pages", "create")) return deny();
      return ok(await prisma.page.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, title: true, slug: true, content: true, status: true, metaTitle: true, metaDescription: true, updatedAt: true } }));
    }
    case "files": {
      if (!hasPermission(p, "files", "access_file_manager")) return deny();
      return ok((await getSiteFiles()).slice(0, 1500));
    }
    case "activity": {
      if (!hasPermission(p, "security", "view_logs")) return deny();
      const rows = await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 2000, include: { user: { select: { username: true } } } });
      return ok(rows.map((l) => ({ id: l.id, user: l.user?.username ?? null, action: l.actionType, text: l.description, ip: l.ipAddress, ua: l.userAgent, at: l.createdAt.toISOString() })));
    }
    case "push": {
      if (!hasPermission(p, "push_notifications", "send")) return deny();
      const canManage = hasPermission(p, "push_notifications", "manage_templates");
      const [settings, subs, history, totals, newThisWeek, breakdown, rows] = await Promise.all([
        getPushSettings(), prisma.pushSubscription.count(), getCampaignHistory(1, 100),
        prisma.pushCampaign.aggregate({ _sum: { sent: true, failed: true } }),
        prisma.pushSubscription.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
        canManage ? subscriberBreakdown() : Promise.resolve([]),
        canManage ? prisma.pushSubscription.findMany({ orderBy: { id: "desc" }, take: 500, select: { id: true, endpoint: true, createdAt: true } }) : Promise.resolve([]),
      ]);
      return ok({
        configured: settings.configured, subscribers: subs, history: history.rows, campaigns: history.total,
        sent: totals._sum.sent ?? 0, failed: totals._sum.failed ?? 0, canManage, newThisWeek, breakdown,
        // Only the push-service host is sent — the full endpoint is a delivery address.
        subscriberRows: rows.map((r) => {
          let host = "";
          try { host = new URL(r.endpoint).hostname; } catch { /* keep blank */ }
          return { id: r.id, host, browser: browserOf(r.endpoint), browserLabel: BROWSER_LABEL[browserOf(r.endpoint)], createdAt: r.createdAt.toISOString() };
        }),
        // The private key never leaves the server — only whether one is saved, and hashes to tell keys apart.
        keys: canManage ? { publicKey: settings.publicKey, subject: settings.subject, hasPrivateKey: !!settings.privateKey, publicFingerprint: keyFingerprint(settings.publicKey), privateFingerprint: keyFingerprint(settings.privateKey) } : null,
      });
    }
    case "business": {
      if (!hasPermission(p, "ecommerce", "manage_payment")) return deny();
      const [b, delivery, tax, gst, invoice, auth] = await Promise.all([
        prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } }),
        getDeliverySettings(), getTaxMode(),
        prisma.ecomGstRate.findMany({ orderBy: { rate: "asc" }, select: { id: true, label: true, rate: true, isDefault: true } }),
        getInvoiceSetup(), getAuthSettings(),
      ]);
      return ok({ business: b, delivery, tax, gstRates: gst.map((g) => ({ ...g, rate: Number(g.rate) })), invoice: invoice.settings, auth });
    }
    case "customizer": {
      if (!hasPermission(p, "ecommerce", "manage_homepage")) return deny();
      const [home, product, store, header, unpublished] = await Promise.all([getDraftHome(), getDraftProductPage(), getStorefrontConfig(), getShopHeaderSettings(), hasUnpublished()]);
      return ok({ home, product, store, header, unpublished, canStore: hasPermission(p, "ecommerce", "manage_payment") });
    }
    case "cache": {
      if (!hasPermission(p, "settings", "maintenance_mode")) return deny();
      return ok(await getCacheStats());
    }
    case "dues_paid": {
      if (!hasPermission(p, "ecommerce", "manage_credits") && !hasPermission(p, "ecommerce", "manage_customers") && !hasPermission(p, "ecommerce", "manage_billing")) return deny();
      return ok(await paidDues());
    }
    case "deliveries": {
      // Deliveries Board → History and Agent report: the last 90 days (the app filters and adds up itself).
      if (!hasPermission(p, "delivery", "view_all")) return deny();
      const d = await loadDeliveryHistory({ from: ymd(new Date(Date.now() - 90 * 86_400_000)), to: ymd(new Date()), preset: "custom", agent: null, status: "all", q: "" });
      return ok({ rows: d.rows, agents: d.agents });
    }
    case "customer_orders": {
      // Customer profile → Orders: every order of every customer, light (the last 60 days come with sync).
      if (!hasPermission(p, "ecommerce", "manage_customers") && !hasPermission(p, "ecommerce", "manage_credits")) return deny();
      const rows = await prisma.ecomOrder.findMany({
        where: { customerId: { not: null } }, orderBy: { id: "desc" }, take: 20000,
        select: { id: true, orderNumber: true, orderType: true, orderStatus: true, paymentStatus: true, customerId: true, totalAmount: true, createdAt: true, payments: { select: { paymentMethod: true, amount: true, createdAt: true } } },
      });
      return ok(rows.map((o) => ({
        id: o.id, number: o.orderNumber, type: o.orderType, status: o.orderStatus, paymentStatus: o.paymentStatus, customerId: o.customerId, total: Number(o.totalAmount), createdAt: o.createdAt.toISOString(),
        pays: o.payments.map((x) => ({ method: x.paymentMethod, amount: Number(x.amount), at: x.createdAt.toISOString() })),
      })));
    }
    case "addresses": {
      // Customer profile → Addresses: the delivery addresses customers saved on the shop.
      if (!hasPermission(p, "ecommerce", "manage_customers")) return deny();
      const rows = await prisma.ecomCustomerAddress.findMany({ orderBy: [{ isDefault: "desc" }, { id: "desc" }] });
      return ok(rows.map((a) => ({
        id: a.id, customerId: a.customerId, name: a.name, phone: a.phone, type: a.type, isDefault: a.isDefault,
        text: [a.house, a.area, a.landmark ? `Near ${a.landmark}` : null, a.city, `${a.state} - ${a.pincode}`].filter(Boolean).join(", "),
        mapUrl: a.lat !== null && a.lng !== null ? `https://maps.google.com/?q=${Number(a.lat)},${Number(a.lng)}` : null,
      })));
    }
    case "sales_ledger":
    case "sales_ledger_old":
    case "sales_ledger_recent": {
      // Analytics / GST report / Sales history for any period, offline. The Windows software keeps the whole
      // history: "_old" = everything before the last 60 days (fetched at login, then daily), "_recent" = the
      // last 60 days (every sync). Plain "sales_ledger" (older apps) = the last ~15 months. Cancelled left out.
      if (!hasPermission(p, "ecommerce", "manage_orders") && !hasPermission(p, "ecommerce", "manage_billing")) return deny();
      const cut = new Date(Date.now() - 60 * 86_400_000);
      const createdAt = name === "sales_ledger_old" ? { lt: cut } : name === "sales_ledger_recent" ? { gte: cut } : { gte: new Date(Date.now() - 460 * 86_400_000) };
      const rows = await prisma.ecomOrder.findMany({
        where: { orderStatus: { not: "Canceled" }, createdAt }, orderBy: { id: "asc" }, take: 500000,
        select: {
          id: true, orderNumber: true, orderType: true, orderStatus: true, paymentStatus: true, paymentMethod: true, customerId: true, customerName: true, createdAt: true,
          totalAmount: true, subtotalAmount: true, gstAmount: true, discountAmount: true, deliveryCharge: true,
          items: { select: { productId: true, productName: true, qty: true, price: true, gstRate: true, gstAmount: true } },
          payments: { select: { paymentMethod: true, amount: true } },
        },
      });
      return ok(rows.map((o) => ({
        id: o.id, number: o.orderNumber, type: o.orderType, status: o.orderStatus, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, customerId: o.customerId, customer: o.customerName,
        createdAt: o.createdAt.toISOString(), total: Number(o.totalAmount), subtotal: Number(o.subtotalAmount), gst: Number(o.gstAmount), discount: Number(o.discountAmount), delivery: Number(o.deliveryCharge),
        items: o.items.map((i) => ({ productId: i.productId, name: i.productName, qty: i.qty, price: Number(i.price), gstRate: Number(i.gstRate), gst: Number(i.gstAmount) })),
        pays: o.payments.map((x) => ({ method: x.paymentMethod, amount: Number(x.amount) })),
      })));
    }
    case "payments": {
      // Payment Methods: which are on / default / set up. Saved credentials are never sent — only whether each field is filled.
      if (!hasPermission(p, "ecommerce", "manage_payment")) return deny();
      const rows = await prisma.ecomPaymentSettings.findMany();
      const byKey = new Map(rows.map((r) => [r.methodKey, r]));
      return ok(PAYMENT_METHODS.map((def) => {
        const row = byKey.get(def.key);
        const config = (row?.config as Record<string, string> | null) ?? {};
        const filled = Object.fromEntries(def.fields.map((f) => [f.key, (config[f.key] ?? "").trim() !== ""]));
        return {
          key: def.key, label: def.label, text: row?.text ?? "", isEnabled: row?.isEnabled ?? false, isDefault: row?.isDefault ?? false,
          fields: def.fields.map((f) => ({ key: f.key, label: f.label, type: f.type ?? "text", options: f.options ?? null })), filled,
          configured: def.fields.length === 0 || def.fields.every((f) => filled[f.key]),
        };
      }));
    }
    case "backups": {
      if (s.role !== "admin") return deny();
      return ok(await listBackups());
    }
    default:
      return NextResponse.json({ success: false, message: "Unknown page." }, { status: 404 });
  }
}

export const GET = withApiErrors(handleGET);
