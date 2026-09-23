import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getLedgerRows, parseSalesFilters, type RawSearchParams } from "@/lib/sales-history2";

/**
 * CSV export for /admin/ecommerce/sales-history — the same rows the Sales
 * Ledger shows for the same filters (it reads the page's own query string).
 * Dates/times are India time. A UTF-8 BOM makes Excel read ₹ and names
 * correctly.
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_billing")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries()) as RawSearchParams;
  const filters = parseSalesFilters(sp);
  const rows = await getLedgerRows(filters);

  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ["Date", "Time", "Order ID", "Customer", "Type", "Items", "Payment Method", "Total", "Paid", "Due", "Payment Status"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const d = new Date(r.createdAt);
    lines.push(
      [
        date.format(d),
        time.format(d),
        r.orderNumber,
        r.customerName,
        r.orderType === "online" ? "Online" : "Store",
        r.itemsSummary,
        r.paymentMethod,
        r.total.toFixed(2),
        r.paid.toFixed(2),
        r.due.toFixed(2),
        r.paymentLabel,
      ]
        .map(cell)
        .join(",")
    );
  }

  const filename = `sales-history_${filters.from}_to_${filters.to}.csv`;
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
