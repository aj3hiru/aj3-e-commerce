import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DateRangeBar } from "@/components/admin/DateRangeBar";
import { DashboardSections } from "@/components/admin/DashboardSections";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { resolveDashboardRange } from "@/lib/dashboard-range";
import { getDashboardStats } from "@/lib/dashboard-stats";

interface DashboardPageProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}

/**
 * Verified against admin/dashboard.php:
 * - Access denied if not logged in / inactive / missing 'dashboard_access' permission
 * - Date range resolution (today/yesterday/7days/this_month/prev_month/custom)
 * - All stat queries, and the Recent Orders table
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getAdminSession();
  // NOTE: dashboard_access is a top-level permission key (not nested under a group
  // like "ecommerce"), matching `empty($permissions['dashboard_access'])` in the PHP.
  if (!session || !(session.permissions as unknown as Record<string, boolean>).dashboard_access) {
    redirect("/shop/login");
  }

  const params = await searchParams;
  const range = resolveDashboardRange(params.range, params.from, params.to);
  const stats = await getDashboardStats(range);

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="E-commerce Dashboard"
      pageSubtitle="A live overview of your store"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <DateRangeBar
        currentRange={range.range}
        rangeLabel={range.rangeLabel}
        dateFrom={range.dateFrom}
        dateTo={range.dateTo}
      />
      <DashboardSections stats={stats} rangeLabel={range.rangeLabel} />
    </AdminShell>
  );
}
