import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { GstReportView } from "@/components/admin/gst-report/GstReportView";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { buildGstReport, parseGstFilters } from "@/lib/gst-report";

/** Tax → GST Report: rate-wise, HSN-wise, product-wise and invoice-wise GST for a month, quarter, year or custom dates. */
export default async function GstReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  const p = session.permissions;
  if (!hasPermission(p, "ecommerce", "manage_orders") && !hasPermission(p, "ecommerce", "manage_billing")) redirect("/admin/dashboard?denied=1");

  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const report = await buildGstReport(parseGstFilters(flat));

  return (
    <AdminShell siteName="EduMint24" pageTitle="GST Report" pageSubtitle="Tax on your sales — by rate, HSN, product and invoice" username={session.username} role={session.role} permissions={p}>
      <GstReportView report={report} />
    </AdminShell>
  );
}
