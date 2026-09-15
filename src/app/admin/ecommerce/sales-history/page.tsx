import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DateRangeBar } from "@/components/admin/DateRangeBar";
import { SalesHistoryTable } from "@/components/admin/SalesHistoryTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { resolveDashboardRange } from "@/lib/dashboard-range";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

interface SalesHistoryPageProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string; sale_type?: string }>;
}

/**
 * Verified against admin/ecommerce/sales-history.php:
 * "Sale" = every offline (POS) order, plus every online order that's been
 * Delivered — pending online orders stay on the Orders page, not here.
 */
export default async function SalesHistoryPage({ searchParams }: SalesHistoryPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_billing")) {
    redirect("/shop/login");
  }

  const params = await searchParams;
  const range = resolveDashboardRange(params.range, params.from, params.to);
  const saleType = (["all", "offline", "online"].includes(params.sale_type ?? "") ? params.sale_type : "all") as "all" | "offline" | "online";

  const typeCondition =
    saleType === "offline"
      ? { orderType: "offline" }
      : saleType === "online"
      ? { orderType: "online", orderStatus: "Delivered" }
      : { OR: [{ orderType: "offline" }, { orderType: "online", orderStatus: "Delivered" }] };

  const sales = await prisma.ecomOrder.findMany({
    where: { ...typeCondition, createdAt: { gte: range.rangeStart, lte: range.rangeEnd } },
    orderBy: { createdAt: "desc" },
    include: {
      items: { select: { qty: true, productName: true } },
      credits: { select: { status: true }, take: 1 },
    },
  });

  const totalAmount = sales.reduce((s: number, o: (typeof sales)[number]) => s + Number(o.totalAmount), 0);

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Sales History"
      pageSubtitle="Every completed sale, in-store and online"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <DateRangeBar currentRange={range.range} rangeLabel={range.rangeLabel} dateFrom={range.dateFrom} dateTo={range.dateTo} />

      <div className="flex items-center justify-between mb-3">
        <div className="flex rounded-md overflow-hidden border border-admin-gray-300 w-fit">
          {(["all", "offline", "online"] as const).map((t) => (
            <a
              key={t}
              href={`?range=${range.range}&sale_type=${t}`}
              className={cn(
                "px-3 py-1.5 text-[0.8125rem] border-r border-admin-gray-300 last:border-r-0",
                saleType === t ? "bg-admin-primary text-white" : "bg-white text-admin-gray-700 hover:bg-admin-gray-50"
              )}
            >
              {t === "all" ? "All" : t === "offline" ? "Store" : "Online"}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/admin/ecommerce/sales-report-print?range=${range.range}&sale_type=${saleType}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-admin-primary font-medium"
          >
            Print Report
          </a>
          <div className="text-sm text-admin-gray-500">
            Total: <strong className="text-admin-gray-900">₹{totalAmount.toFixed(2)}</strong> ({sales.length} sales)
          </div>
        </div>
      </div>

      <SalesHistoryTable
        sales={sales.map((o: (typeof sales)[number]) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          customerName: o.customerName || "—",
          orderType: o.orderType,
          itemsSummary: o.items.map((it: (typeof o.items)[number]) => `${it.qty}x ${it.productName}`).join(", ") || "—",
          itemCount: o.items.length,
          totalAmount: Number(o.totalAmount),
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentMethod,
          createdAt: o.createdAt.toISOString(),
          creditStatus: o.credits[0]?.status ?? null,
        }))}
      />
    </AdminShell>
  );
}
