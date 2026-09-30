import { NextResponse, type NextRequest } from "next/server";
import { appSession } from "@/lib/app-api";
import { withApiErrors } from "@/lib/api-errors";
import { resolveDashboardRange } from "@/lib/dashboard-range";
import { getDashboard2Stats } from "@/lib/dashboard2-stats";
import { billingData, catalogData, marketingData, orderDeskData } from "@/lib/role-dashboards";

/**
 * The website's /admin/dashboard for the Windows software — the same view and numbers the website shows
 * this person (see src/app/admin/dashboard/page.tsx): the store dashboard for admins and managers
 * (for ?range=…&from=…&to=…), otherwise the role's own dashboard.
 */
async function handleGET(req: NextRequest) {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  const p = s.permissions;
  const role = s.role;
  if (!(p as unknown as Record<string, boolean>).dashboard_access) return NextResponse.json({ success: true, view: "denied" });
  if (role !== "admin" && role !== "manager") {
    if (role === "delivery_agent" || (p.delivery?.deliver && !p.orders?.view && !p.ecommerce?.manage_billing)) return NextResponse.json({ success: true, view: "agent" });
    if (role === "order_manager" || (p.orders?.view && !p.ecommerce?.manage_billing && !p.ecommerce?.manage_products))
      return NextResponse.json({ success: true, view: "orderDesk", canAccept: !!p.orders?.accept_reject, data: await orderDeskData() });
    if (role === "cashier" || (p.ecommerce?.manage_billing && !p.ecommerce?.manage_products)) return NextResponse.json({ success: true, view: "billing", data: await billingData() });
    if (role === "catalog_manager" || (p.ecommerce?.manage_products && !p.orders?.view)) return NextResponse.json({ success: true, view: "catalog", data: await catalogData() });
    if (role === "marketing" || p.ecommerce?.manage_homepage || p.ecommerce?.manage_coupons) return NextResponse.json({ success: true, view: "marketing", data: await marketingData() });
  }
  const q = req.nextUrl.searchParams;
  const range = resolveDashboardRange(q.get("range") ?? undefined, q.get("from") ?? undefined, q.get("to") ?? undefined);
  const stats = await getDashboard2Stats(range);
  return NextResponse.json({
    success: true, view: "store",
    range: { range: range.range, dateFrom: range.dateFrom, dateTo: range.dateTo, rangeLabel: range.rangeLabel },
    stats: { ...stats, recentOrders: stats.recentOrders.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })) },
  });
}

export const GET = withApiErrors(handleGET);
