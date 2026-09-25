import { NextRequest, NextResponse } from "next/server";
import { appSession } from "@/lib/app-api";
import { hasPermission } from "@/lib/admin-auth";
import { getReport, parseReportFilters } from "@/lib/report-builder";
import { withApiErrors } from "@/lib/api-errors";

/** Report Builder data for the app — same filters and access rules as /admin/ecommerce/reports. */
async function handleGET(req: NextRequest) {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  if (!hasPermission(s.permissions, "ecommerce", "manage_orders") && !hasPermission(s.permissions, "ecommerce", "manage_billing")) {
    return NextResponse.json({ success: false, message: "You don't have access to reports." }, { status: 403 });
  }
  const filters = parseReportFilters(Object.fromEntries(req.nextUrl.searchParams));
  const canStaff = s.role === "admin" || hasPermission(s.permissions, "users", "create");
  if (filters.userId && !canStaff && filters.userId !== s.userId) filters.userId = null;
  const data = await getReport(filters);
  if (!canStaff) data.staffList = data.staffList.filter((u) => u.id === s.userId);
  return NextResponse.json({ success: true, report: data });
}

export const GET = withApiErrors(handleGET);
