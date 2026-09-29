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
import { getPushSettings } from "@/lib/push-settings";
import { listBackups } from "@/lib/backup";
import { getDeliverySettings } from "@/lib/delivery-charge";
import { getTaxMode } from "@/lib/tax-mode";
import { getDraftHome, hasUnpublished } from "@/lib/home-config";
import { getDraftProductPage } from "@/lib/product-page-config";
import { getStorefrontConfig } from "@/lib/storefront-config";
import { getShopHeaderSettings } from "@/lib/header-settings";

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
      const d = await getCampaigns2Data(parseRange({}));
      return ok({ campaigns: d.campaigns, offers: d.offers.length });
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
      const rows = await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 400, include: { user: { select: { username: true } } } });
      return ok(rows.map((l) => ({ id: l.id, user: l.user?.username ?? null, action: l.actionType, text: l.description, ip: l.ipAddress, at: l.createdAt.toISOString() })));
    }
    case "push": {
      if (!hasPermission(p, "push_notifications", "send")) return deny();
      const [settings, subs, history] = await Promise.all([getPushSettings(), prisma.pushSubscription.count(), getCampaignHistory(1, 40)]);
      return ok({ configured: settings.configured, subscribers: subs, history: history.rows });
    }
    case "business": {
      if (!hasPermission(p, "ecommerce", "manage_payment")) return deny();
      const [b, delivery, tax, gst] = await Promise.all([
        prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } }),
        getDeliverySettings(), getTaxMode(),
        prisma.ecomGstRate.findMany({ orderBy: { rate: "asc" }, select: { id: true, label: true, rate: true, isDefault: true } }),
      ]);
      return ok({ business: b, delivery, tax, gstRates: gst.map((g) => ({ ...g, rate: Number(g.rate) })) });
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
    case "backups": {
      if (s.role !== "admin") return deny();
      return ok(await listBackups());
    }
    default:
      return NextResponse.json({ success: false, message: "Unknown page." }, { status: 404 });
  }
}

export const GET = withApiErrors(handleGET);
