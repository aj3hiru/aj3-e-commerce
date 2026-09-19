"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import {
  StatusDropdown,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  orderStatusVariant,
  paymentStatusVariant,
} from "./StatusDropdown";
import { formatMoney } from "@/lib/format";
import type { RecentOrder } from "@/lib/dashboard-stats";

interface RecentOrdersTableProps {
  orders: RecentOrder[];
  rangeLabel: string;
}

/**
 * The `data-widget="recentorders"` card at the bottom of admin/dashboard.php.
 *
 * Two changes on top of the PHP, both asked for by the store owner:
 *  • the Payment and Status cells are now the same editable `.status-btn`
 *    dropdowns the orders list uses, instead of read-only `.badge` pills;
 *  • "Out for Delivery" joins the order-status list (see StatusDropdown.tsx).
 * The order number was already a link to order-view in the PHP and stays one.
 *
 * Layout is Bootstrap `.gd-card` + `.table.table-bordered`:
 *   .gd-card      { border:1px solid rgba(0,0,0,.08); radius .35rem;
 *                   shadow 0 .15rem 1.75rem 0 rgba(58,59,69,.1) }
 *   .gd-card-body { padding: 1.25rem 1.5rem }
 *   .table-bordered cells all carry a 1px #dee2e6 border; .table cell padding
 *   is .5rem and its bottom border is inherited from the same colour.
 */
export function RecentOrdersTable({ orders, rangeLabel }: RecentOrdersTableProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function patch(id: number, body: Record<string, string>) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/ecommerce/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // A rejected update must not leave the pill showing the new value — the
      // table only re-renders from the server, so surface the failure instead.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Could not update the order. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div data-widget="recentorders" className="mt-3 mb-6 rounded-card border border-card bg-white shadow-card">
      <div className="px-6 py-5">
        {/* Bootstrap h5 = 1.25rem / 500, .mb-3 */}
        <h5 className="mb-3 flex items-center gap-2 text-xl font-medium text-admin-gray-800">
          <Clock className="h-[0.9em] w-[0.9em] text-admin-primary" />
          Recent Orders <small className="text-[0.875em] font-normal text-[#6c757d]">({rangeLabel})</small>
        </h5>

        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {orders.length === 0 ? (
          <p className="mb-0 text-[#6c757d]">No orders in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-[#dee2e6] text-sm">
              <thead>
                <tr className="text-left [&>th]:border [&>th]:border-[#dee2e6] [&>th]:p-2 [&>th]:font-bold [&>th]:align-middle">
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="[&>td]:border [&>td]:border-[#dee2e6] [&>td]:p-2 [&>td]:align-middle">
                    <td>
                      <Link
                        href={`/admin/ecommerce/orders/${o.id}`}
                        className="text-admin-primary hover:underline"
                        title={`Open order ${o.orderNumber}`}
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td>{o.customerName}</td>
                    <td>
                      <span
                        title={o.itemsSummary}
                        className="inline-block max-w-[200px] truncate align-bottom"
                      >
                        {o.itemsSummary}
                      </span>
                    </td>
                    <td>{formatMoney(o.totalAmount)}</td>
                    <td>
                      <StatusDropdown
                        label={`Change payment status for order ${o.orderNumber}`}
                        value={o.paymentStatus}
                        options={PAYMENT_STATUSES}
                        variant={paymentStatusVariant(o.paymentStatus)}
                        disabled={busyId === o.id}
                        onSelect={(paymentStatus) => patch(o.id, { paymentStatus })}
                      />
                    </td>
                    <td>
                      <StatusDropdown
                        label={`Change order status for order ${o.orderNumber}`}
                        value={o.orderStatus}
                        options={ORDER_STATUSES}
                        variant={orderStatusVariant(o.orderStatus)}
                        disabled={busyId === o.id}
                        onSelect={(orderStatus) => patch(o.id, { orderStatus })}
                      />
                    </td>
                    <td className="whitespace-nowrap">
                      {o.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
