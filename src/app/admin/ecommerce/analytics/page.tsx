import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DateRangeBar } from "@/components/admin/DateRangeBar";
import { TopProductsTable, CategoryBreakdownList, LowStockAlert, OrderTypeFilter } from "@/components/admin/AnalyticsWidgets";
import { StatCard } from "@/components/admin/StatCard";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { resolveDashboardRange } from "@/lib/dashboard-range";
import { getEcommerceAnalytics } from "@/lib/ecommerce-analytics";
import { IndianRupee, ShoppingCart, Package, Users } from "lucide-react";

interface AnalyticsPageProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string; type?: string }>;
}

/**
 * Ecommerce product/sales analytics dashboard. This is a NEW feature, not a port —
 * the original admin/blog/analytics.php is purely blog-post analytics (views,
 * authors) with no ecommerce or product content at all. Built here on the same
 * verified ecom_orders/ecom_order_items/ecom_products schema used throughout the
 * rest of the admin ecommerce section.
 */
export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_orders")) {
    redirect("/shop/login");
  }

  const params = await searchParams;
  const range = resolveDashboardRange(params.range, params.from, params.to);
  const orderType = (["all", "online", "offline"].includes(params.type ?? "") ? params.type : "all") as "all" | "online" | "offline";

  const data = await getEcommerceAnalytics(range, orderType);

  const maxDailyRevenue = Math.max(1, ...data.dailyRevenue.map((d) => d.revenue));

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Analytics"
      pageSubtitle="Product and sales performance insights"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <DateRangeBar currentRange={range.range} rangeLabel={range.rangeLabel} dateFrom={range.dateFrom} dateTo={range.dateTo} />

      <div className="mb-4">
        <OrderTypeFilter current={orderType} range={range.range} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard color="green" icon={IndianRupee} label={`Revenue (${range.rangeLabel})`} value={`₹${data.totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} widgetKey="an-revenue" />
        <StatCard color="blue" icon={ShoppingCart} label="Orders" value={data.totalOrders.toLocaleString("en-IN")} widgetKey="an-orders" />
        <StatCard color="orange" icon={Package} label="Units Sold" value={data.totalUnitsSold.toLocaleString("en-IN")} widgetKey="an-units" />
        <StatCard color="cyan" icon={Users} label="Avg. Order Value" value={`₹${data.avgOrderValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} widgetKey="an-aov" />
      </div>

      {/* Revenue trend — simple inline bar visualization, no extra chart dependency needed */}
      <div className="bg-white rounded-lg border border-admin-gray-200 p-5 mb-5">
        <h5 className="font-bold mb-4">Daily Revenue Trend</h5>
        {data.dailyRevenue.length === 0 ? (
          <p className="text-sm text-admin-gray-400">No sales in this period.</p>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {data.dailyRevenue.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end group relative">
                <div
                  className="w-full bg-admin-primary hover:bg-admin-primary-dark rounded-t transition-colors"
                  style={{ height: `${Math.max(2, (d.revenue / maxDailyRevenue) * 100)}%` }}
                  title={`${d.date}: ₹${d.revenue.toFixed(2)} (${d.orderCount} orders)`}
                />
                <span className="text-[9px] text-admin-gray-400 mt-1 rotate-45 origin-top-left whitespace-nowrap">
                  {new Date(d.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <TopProductsTable title="Top Selling Products" products={data.topProducts} icon="up" />
        <TopProductsTable title="Lowest Selling Products" products={data.worstProducts} icon="down" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <CategoryBreakdownList categories={data.categoryBreakdown} />
        <div className="space-y-4">
          <LowStockAlert products={data.lowStockProducts} />
          <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
            <h5 className="font-bold mb-3">Customers ({range.rangeLabel})</h5>
            <div className="flex justify-between text-sm mb-2">
              <span>New Customers</span>
              <strong>{data.newVsReturningCustomers.newCustomers}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span>Returning Customers</span>
              <strong>{data.newVsReturningCustomers.returningCustomers}</strong>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
