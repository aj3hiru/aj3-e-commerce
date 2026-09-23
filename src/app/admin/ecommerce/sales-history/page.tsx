import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { GlobalSearchBar } from "@/components/admin/GlobalSearchBar";
import { SalesHistory2Body } from "@/components/admin/sales-history2/SalesHistory2Body";
import { SALES2_GROUPS, SALES2_PREF_KEY, SALES2_STANDALONE } from "@/components/admin/sales-history2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import {
  getFilterOptions, getLedgerRows, getSalesOverview, istYmd, parseSalesFilters, type RawSearchParams,
} from "@/lib/sales-history2";

interface SalesHistory2PageProps {
  searchParams: Promise<RawSearchParams>;
}

/**
 * /admin/ecommerce/sales-history — a trial redesign of Sales History, kept
 * alongside the original /admin/ecommerce/sales-history so the two can be
 * compared (same idea as dashboard2 and billing2). Same access rule and the
 * same definition of a "sale"; header and sidebar are the shared AdminShell.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/sales-history/
 *   src/components/admin/sales-history2/
 *   src/lib/sales-history2.ts
 *   src/app/api/ecommerce/sales-history/export/
 * Nothing else imports them.
 */
export default async function SalesHistory2Page({ searchParams }: SalesHistory2PageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_billing")) {
    redirect("/shop/login");
  }

  const sp = await searchParams;
  const filters = parseSalesFilters(sp);
  const today = istYmd(new Date());
  const isDefaultRange = filters.from === `${today.slice(0, 8)}01` && filters.to === today;

  const [rows, { metrics, chart }, options] = await Promise.all([
    getLedgerRows(filters),
    getSalesOverview(filters),
    getFilterOptions(),
  ]);

  // Export downloads exactly what the ledger shows: same filters, same rows.
  const exportParams = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.status !== "all") exportParams.set("status", filters.status);
  if (filters.payment !== "all") exportParams.set("payment", filters.payment);
  if (filters.customer) exportParams.set("customer", filters.customer);
  if (filters.product) exportParams.set("product", filters.product);
  if (filters.q) exportParams.set("q", filters.q);
  const exportHref = `/api/ecommerce/sales-history/export?${exportParams.toString()}`;

  const exportBtn = (
    <a
      href={exportHref}
      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]"
    >
      <Download className="h-4 w-4" /> Export
    </a>
  );
  const newSaleBtn = (
    <Link
      href="/admin/ecommerce/billing"
      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-blue-600 px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
    >
      <Plus className="h-4 w-4" /> New Sale
    </Link>
  );

  return (
    // Provider wraps the shell: Display Options sits in the header while the
    // cards it hides live in the page body (same as dashboard2 / billing2).
    <DashboardWidgetPrefsProvider prefKey={SALES2_PREF_KEY} groups={SALES2_GROUPS} standalone={SALES2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Sales History"
        pageSubtitle="Every completed sale — in-store and online — in one place"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <div className="hidden w-[240px] min-[1600px]:block">
              <GlobalSearchBar variant="toolbar" />
            </div>
            <DisplayOptionsPanel variant="header" />
            {exportBtn}
            {newSaleBtn}
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" />
          {exportBtn}
          {newSaleBtn}
        </div>

        <SalesHistory2Body
          rows={rows}
          metrics={metrics}
          chart={chart}
          filters={filters}
          isDefaultRange={isDefaultRange}
          options={options}
        />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
