import { redirect } from "next/navigation";
import { SalesReportPrint } from "@/components/admin/SalesReportPrint";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { resolveDashboardRange } from "@/lib/dashboard-range";
import { getSalesReportData } from "@/lib/sales-report-data";
import { getInvoiceBusinessSettings } from "@/lib/invoice-data";

interface SalesReportPrintPageProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string; sale_type?: string }>;
}

const SALE_TYPE_LABELS: Record<string, string> = { all: "All Sales", offline: "Store Sales Only", online: "Online Sales Only" };

export default async function SalesReportPrintPage({ searchParams }: SalesReportPrintPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_billing")) {
    redirect("/staff/login");
  }

  const params = await searchParams;
  const range = resolveDashboardRange(params.range, params.from, params.to);
  const saleType = (["all", "offline", "online"].includes(params.sale_type ?? "") ? params.sale_type : "all") as "all" | "offline" | "online";

  const [data, biz] = await Promise.all([getSalesReportData(range, saleType), getInvoiceBusinessSettings()]);

  return (
    <SalesReportPrint
      data={data}
      biz={{
        businessName: biz.businessName, hasGstin: biz.hasGstin, hasPan: biz.hasPan, hasFssai: biz.hasFssai,
        gstin: biz.gstin, panNumber: biz.panNumber, fssaiNumber: biz.fssaiNumber,
        showAddressOnInvoice: biz.showAddressOnInvoice, address: biz.address,
      }}
      rangeLabel={range.rangeLabel}
      saleTypeLabel={SALE_TYPE_LABELS[saleType]}
    />
  );
}
