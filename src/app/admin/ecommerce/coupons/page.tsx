import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { OffersTabs } from "@/components/admin/OffersTabs";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { Coupons2Body, Coupons2HeaderButtons, type Coupon2Row } from "@/components/admin/coupons2/Coupons2Body";
import { COUPONS2_GROUPS, COUPONS2_PREF_KEY, COUPONS2_STANDALONE } from "@/components/admin/coupons2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getCouponActivity } from "@/lib/coupons2-activity";
import { prisma } from "@/lib/db";

/**
 * /admin/ecommerce/coupons2 — a trial redesign of Coupons, kept alongside
 * /admin/ecommerce/coupons so the two can be compared. Same access rule
 * (manage_coupons), same underlying ecom_coupons table plus two small
 * additive columns (starts_at, ends_at, is_paused — see prisma/coupons2.sql)
 * needed for the Scheduled/Expired/Paused states and date-window shown in
 * the new design. The "Recent Activity" panel is real data too: it reads
 * the same activity_logs rows every coupon create/update/delete already
 * writes (lib/activity-log.ts) — nothing there is synthesized.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/coupons2/
 *   src/components/admin/coupons2/
 *   src/app/api/ecommerce/coupons2/
 *   src/lib/coupon2-save.ts
 *   src/lib/coupons2-activity.ts
 * (the three ecom_coupons columns added for this page can stay — nothing
 * else needs them removed, and the original /coupons page ignores them.)
 */
export default async function Coupons2Page() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_coupons")) {
    redirect("/staff/login");
  }

  const [rows, products, categories, subcategories, activity] = await Promise.all([
    prisma.ecomCoupon.findMany({
      orderBy: { id: "desc" },
      include: { product: { select: { name: true } }, category: { select: { name: true } }, subcategory: { select: { name: true } } },
    }),
    prisma.ecomProduct.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ecomCategory.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ecomSubcategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getCouponActivity(12),
  ]);

  const coupons: Coupon2Row[] = (rows as {
    id: number; title: string; code: string; discountType: string; discountValue: unknown; appliesTo: string;
    numberOfTimes: number; usedCount: number; status: string; isPaused: boolean; startsAt: Date | null; endsAt: Date | null;
    createdAt: Date; product: { name: string } | null; category: { name: string } | null; subcategory: { name: string } | null;
  }[]).map((c) => ({
    id: c.id, title: c.title, code: c.code, discountType: c.discountType, discountValue: Number(c.discountValue),
    appliesTo: c.appliesTo,
    appliesToLabel:
      c.appliesTo === "product" ? (c.product?.name ?? "A deleted product") :
      c.appliesTo === "category" ? (c.category?.name ?? "A deleted category") :
      c.appliesTo === "subcategory" ? (c.subcategory?.name ?? "A deleted subcategory") : "All Products",
    numberOfTimes: c.numberOfTimes, usedCount: c.usedCount, status: c.status, isPaused: c.isPaused,
    startsAt: c.startsAt ? c.startsAt.toISOString() : null, endsAt: c.endsAt ? c.endsAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <DashboardWidgetPrefsProvider prefKey={COUPONS2_PREF_KEY} groups={COUPONS2_GROUPS} standalone={COUPONS2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Offers & Coupons"
        pageSubtitle="Coupons — discount codes customers enter at checkout"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /><Coupons2HeaderButtons /></div>}
      >
        <OffersTabs active="coupons" canCampaigns={hasPermission(session.permissions, "ecommerce", "manage_products")} canCoupons />
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" /><Coupons2HeaderButtons />
        </div>
        <Coupons2Body coupons={coupons} activity={activity} options={{ products, categories, subcategories }} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
