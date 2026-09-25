import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { RangeBar2 } from "@/components/admin/analytics2/RangeBar2";
import { Analytics2Body } from "@/components/admin/analytics2/Analytics2Body";
import { ANALYTICS2_GROUPS, ANALYTICS2_PREF_KEY, ANALYTICS2_STANDALONE } from "@/components/admin/analytics2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { resolveAnalytics2Range } from "@/lib/analytics2-range";
import { getAnalytics2Data } from "@/lib/analytics2";

/**
 * /admin/ecommerce/analytics2 — a trial redesign of the ecommerce Analytics
 * page (itself a NEW feature, not a PHP port — admin/blog/analytics.php is
 * purely blog analytics, see /admin/ecommerce/analytics's own notes). Same
 * access rule (manage_orders), same underlying verified tables
 * (ecom_orders, ecom_order_items, ecom_products, ecom_categories,
 * ecom_customers, ecom_order_payments) via lib/ecommerce-analytics.ts and
 * the new lib/analytics2.ts (Gross/Net split + payment-method breakdown +
 * previous-period deltas).
 *
 * Deliberately NOT included: a "Sales Funnel" (Visits → Product Views →
 * Add to Cart → Checkout) or a "Conversion Rate" card. Nothing in this
 * schema tracks page views, product views or add-to-cart events — only
 * completed orders — so those numbers would have to be invented. Every
 * figure on this page is real, computed straight from orders.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/analytics2/
 *   src/components/admin/analytics2/
 *   src/lib/analytics2.ts
 *   src/lib/analytics2-range.ts
 * (lib/ecommerce-analytics.ts stays — the original /analytics page still uses it.)
 */
interface Analytics2PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Analytics2Page({ searchParams }: Analytics2PageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_orders")) {
    redirect("/staff/login");
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = resolveAnalytics2Range(one(sp.preset), one(sp.from), one(sp.to));
  const compare = one(sp.compare) !== "0";
  const orderType = (["all", "online", "offline"].includes(one(sp.type) ?? "") ? one(sp.type) : "all") as "all" | "online" | "offline";

  const data = await getAnalytics2Data(range, orderType);

  return (
    <DashboardWidgetPrefsProvider prefKey={ANALYTICS2_PREF_KEY} groups={ANALYTICS2_GROUPS} standalone={ANALYTICS2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Analytics"
        pageSubtitle="Track performance, analyze trends, and grow your sales"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /></div>}
      >
        <div className="mb-5 flex justify-end xl:hidden"><DisplayOptionsPanel variant="toolbar" /></div>
        <RangeBar2 preset={range.preset} dateFrom={range.dateFrom} dateTo={range.dateTo} compare={compare} data={data} />
        <Analytics2Body data={data} rangeLabel={range.label} compare={compare} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
