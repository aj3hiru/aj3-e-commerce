import Link from "next/link";
import { Clock } from "lucide-react";
import type { RecentOrder } from "@/lib/dashboard-stats";

interface RecentOrdersTableProps {
  orders: RecentOrder[];
  rangeLabel: string;
}

/** Verified against the recentorders <table> markup in dashboard.php. */
export function RecentOrdersTable({ orders, rangeLabel }: RecentOrdersTableProps) {
  return (
    <div data-widget="recentorders" className="bg-white rounded-lg border border-admin-gray-200 p-5 mt-3">
      <h5 className="flex items-center gap-2 font-semibold mb-3">
        <Clock className="w-4 h-4 text-admin-primary" /> Recent Orders{" "}
        <small className="text-admin-gray-400 font-normal">({rangeLabel})</small>
      </h5>

      {orders.length === 0 ? (
        <p className="text-admin-gray-400 mb-0 text-sm">No orders in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-admin-gray-200 text-left">
                <th className="py-2 pr-3">Order #</th>
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3">Items</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Payment</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-admin-gray-100">
                  <td className="py-2 pr-3">
                    <Link href={`/admin/ecommerce/orders/${o.id}`} className="text-admin-primary font-medium">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{o.customerName}</td>
                  <td className="py-2 pr-3 max-w-[200px] truncate" title={o.itemsSummary}>
                    {o.itemsSummary}
                  </td>
                  <td className="py-2 pr-3">₹{o.totalAmount.toFixed(2)}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${
                        o.paymentStatus === "Paid" ? "bg-emerald-500" : "bg-admin-gray-500"
                      }`}
                    >
                      {o.paymentStatus}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white bg-sky-500">
                      {o.orderStatus}
                    </span>
                  </td>
                  <td className="py-2">{o.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
