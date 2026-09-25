import { redirect } from "next/navigation";
import { DisplayOptionsShell } from "@/components/admin/DisplayOptionsShell";
import { ReportBuilder } from "@/components/admin/report-builder/ReportBuilder";
import { RB_DEFAULT_HIDDEN, RB_GROUPS, RB_PREF_KEY } from "@/components/admin/report-builder/displayOptions";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getReport, parseReportFilters } from "@/lib/report-builder";

/**
 * /admin/ecommerce/reports — Report Builder: a full report for any day, month
 * or range (store + online sales, every product sold, dues, collections,
 * products added, deliveries, staff), for the whole business or one staff
 * member; printable / PDF and Excel.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  const canReports = hasPermission(session.permissions, "ecommerce", "manage_orders") || hasPermission(session.permissions, "ecommerce", "manage_billing");
  if (!canReports) redirect("/admin/dashboard");

  const filters = parseReportFilters(await searchParams);
  // Anyone may see their own report; other people's only with staff management rights.
  const canStaff = session.role === "admin" || hasPermission(session.permissions, "users", "create");
  if (filters.userId && !canStaff && filters.userId !== session.userId) filters.userId = null;
  const data = await getReport(filters);
  if (!canStaff) data.staffList = data.staffList.filter((u) => u.id === session.userId);

  return (
    <DisplayOptionsShell prefKey={RB_PREF_KEY} groups={RB_GROUPS} defaultHidden={RB_DEFAULT_HIDDEN}
      siteName="EduMint24" pageTitle="Report Builder" pageSubtitle="Generate and analyze your sales performance"
      username={session.username} role={session.role} permissions={session.permissions}>
      <ReportBuilder data={data} />
    </DisplayOptionsShell>
  );
}
