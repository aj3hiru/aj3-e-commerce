import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { RangeFilter } from "@/components/admin/dashboard2/RangeFilter";
import { Dashboard2Body } from "@/components/admin/dashboard2/Dashboard2Body";
import { DASHBOARD2_GROUPS, DASHBOARD2_PREF_KEY, DASHBOARD2_STANDALONE } from "@/components/admin/dashboard2/widgets";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession } from "@/lib/admin-auth";
import { resolveDashboardRange } from "@/lib/dashboard-range";
import { getDashboard2Stats } from "@/lib/dashboard2-stats";

interface Dashboard2PageProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}

/**
 * /admin/dashboard2 — a trial redesign of the e-commerce dashboard, kept
 * alongside the original so the two can be compared. Same data, same access
 * rule, same sidebar and header; only the body layout differs.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/dashboard2/
 *   src/components/admin/dashboard2/
 *   src/lib/dashboard2-stats.ts
 * Nothing else imports them.
 */
export default async function Dashboard2Page({ searchParams }: Dashboard2PageProps) {
  const session = await getAdminSession();
  // Same gate as the original dashboard: top-level `dashboard_access`.
  if (!session || !(session.permissions as unknown as Record<string, boolean>).dashboard_access) {
    redirect("/shop/login");
  }

  const params = await searchParams;
  const range = resolveDashboardRange(params.range, params.from, params.to);
  const stats = await getDashboard2Stats(range);

  const filterProps = {
    currentRange: range.range,
    rangeLabel: range.rangeLabel,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  };

  return (
    // The provider wraps the whole shell because the Display Options control
    // lives in the header while the cards it hides live in the body.
    <DashboardWidgetPrefsProvider
      prefKey={DASHBOARD2_PREF_KEY}
      groups={DASHBOARD2_GROUPS}
      standalone={DASHBOARD2_STANDALONE}
    >
      <AdminShell
        showSearch
        siteName="EduMint24"
        pageTitle="E-commerce Dashboard"
        pageSubtitle="A live overview of your store"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          // In the header from 1280px up. The full segmented bar needs ~470px,
          // which only fits beside the search box and user menu from 1800px;
          // between those widths the same filter collapses to one button.
          <div className="hidden items-center gap-3 xl:flex">
            <div className="hidden min-[1800px]:block">
              <RangeFilter mode="segmented" {...filterProps} />
            </div>
            <div className="min-[1800px]:hidden">
              <RangeFilter mode="compact" {...filterProps} />
            </div>
            <DisplayOptionsPanel variant="header" />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same two controls
            move to a toolbar at the top of the page instead of vanishing. */}
        <div className="mb-6 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <RangeFilter mode="compact" {...filterProps} />
          <DisplayOptionsPanel variant="toolbar" />
        </div>

        <Dashboard2Body stats={stats} rangeLabel={range.rangeLabel} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
