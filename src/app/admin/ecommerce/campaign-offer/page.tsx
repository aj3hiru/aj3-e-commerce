import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { OffersTabs } from "@/components/admin/OffersTabs";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { Campaigns2Body, Campaigns2HeaderButtons } from "@/components/admin/campaigns2/Campaigns2Body";
import { CAMPAIGNS2_GROUPS, CAMPAIGNS2_PREF_KEY, CAMPAIGNS2_STANDALONE } from "@/components/admin/campaigns2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getCampaigns2Data, istYmd, parseRange } from "@/lib/campaigns2";

/**
 * /admin/ecommerce/campaign-offer — a redesign of Campaign Offer, kept
 * alongside /admin/ecommerce/campaign-offer so the two can be compared (same
 * idea as products2 / brands2 / sales-history2). Same access rule
 * (manage_products).
 *
 * Unlike the old page — which only kept a list of "campaign prices" that the
 * shop never used — a campaign here really changes prices: for all products,
 * some categories, some brands or chosen products, between a start and an end
 * time. The rules live in src/lib/campaign-core.ts and are applied in the
 * shop and at billing by src/lib/campaign-pricing.ts.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/campaign-offer/   src/components/admin/campaigns2/
 *   src/app/api/ecommerce/campaigns2/          src/lib/campaigns2.ts
 * (the pricing files campaign-core / campaign-pricing / campaign-validate /
 * campaign-refs are used by the shop and billing — keep those unless you also
 * take the campaign hooks out of them).
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CampaignOffer2Page({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/staff/login");
  }

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filters = parseRange({ from: first(sp.from), to: first(sp.to) });
  const today = istYmd(new Date());
  const isDefaultRange = filters.from === `${today.slice(0, 8)}01` && filters.to === today;

  const data = await getCampaigns2Data(filters);

  return (
    <DashboardWidgetPrefsProvider prefKey={CAMPAIGNS2_PREF_KEY} groups={CAMPAIGNS2_GROUPS} standalone={CAMPAIGNS2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Offers & Coupons"
        pageSubtitle="Campaign offers — timed price drops on products, categories or brands"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <DisplayOptionsPanel variant="header" />
            <Campaigns2HeaderButtons />
          </div>
        }
      >
        <OffersTabs active="campaigns" canCampaigns canCoupons={hasPermission(session.permissions, "ecommerce", "manage_coupons")} />
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" />
          <Campaigns2HeaderButtons />
        </div>
        <Campaigns2Body data={data} serverNow={new Date().toISOString()} filters={filters} isDefaultRange={isDefaultRange} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
