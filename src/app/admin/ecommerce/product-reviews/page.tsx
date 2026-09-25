import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { Reviews2Body, Reviews2HeaderButtons } from "@/components/admin/reviews2/Reviews2Body";
import { REVIEWS2_GROUPS, REVIEWS2_PREF_KEY, REVIEWS2_STANDALONE } from "@/components/admin/reviews2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getReviews2Data, parseReviewRange } from "@/lib/reviews2";

/**
 * /admin/ecommerce/product-reviews — a redesign of Product Reviews, kept
 * alongside /admin/ecommerce/product-reviews (same idea as products2 /
 * brands2). Same access rule (manage_products).
 *
 * Needs the three new optional columns on ecom_product_reviews
 * (prisma/reviews2.sql) for linking a review to a customer and an order.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/product-reviews/  src/components/admin/reviews2/
 *   src/app/api/ecommerce/reviews2/  src/lib/reviews2.ts  src/lib/review2-save.ts
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductReviews2Page({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  if (!hasPermission(session.permissions, "ecommerce", "manage_products")) redirect("/admin/dashboard?denied=1");

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = parseReviewRange({ from: first(sp.from), to: first(sp.to) });
  const data = await getReviews2Data(range);

  return (
    <DashboardWidgetPrefsProvider prefKey={REVIEWS2_PREF_KEY} groups={REVIEWS2_GROUPS} standalone={REVIEWS2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Product Reviews"
        pageSubtitle="Read, approve and manage what customers say about your products"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <DisplayOptionsPanel variant="header" />
            <Reviews2HeaderButtons />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" />
          <Reviews2HeaderButtons />
        </div>
        <Reviews2Body data={data} range={range} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
