"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Receipt, Eye } from "lucide-react";
import {
  StatusDropdown,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  orderStatusVariant,
  paymentStatusVariant,
} from "./StatusDropdown";
import { formatMoney } from "@/lib/format";

export interface OrderRow {
  id: number;
  orderNumber: string;
  customerLabel: string;
  itemsSummary: string;
  addressLabel: string;
  totalAmount: number;
  paymentStatus: string;
  orderStatus: string;
}

interface OrdersTableProps {
  orders: OrderRow[];
  currentType: string;
}

/** Verified against the #admin-table markup + status dropdowns in orders.php. */
export function OrdersTable({ orders, currentType }: OrdersTableProps) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function setOrderStatus(id: number, orderStatus: string) {
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setPaymentStatus(id: number, paymentStatus: string) {
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/orders/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-card border border-card shadow-card py-16 text-center text-admin-gray-400">
        <Receipt className="w-10 h-10 mx-auto mb-3" />
        <p>No orders found{currentType ? " for this status" : ""}.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-card border border-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left [&>th]:font-bold">
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Address</th>
                <th className="py-3 px-4">Total Amount</th>
                <th className="py-3 px-4">Payment Status</th>
                <th className="py-3 px-4">Order Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-admin-gray-100">
                  <td className="py-2.5 px-4">
                    <Link href={`/admin/ecommerce/orders/${o.id}`} className="text-admin-primary font-medium">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2.5 px-4">{o.customerLabel}</td>
                  <td className="py-2.5 px-4 max-w-[220px] truncate" title={o.itemsSummary}>{o.itemsSummary}</td>
                  <td className="py-2.5 px-4 max-w-[180px] truncate" title={o.addressLabel}>{o.addressLabel}</td>
                  <td className="py-2.5 px-4">{formatMoney(o.totalAmount)}</td>
                  <td className="py-2.5 px-4">
                    <StatusDropdown
                      label={`Change payment status for order ${o.orderNumber}`}
                      value={o.paymentStatus}
                      options={PAYMENT_STATUSES}
                      variant={paymentStatusVariant(o.paymentStatus)}
                      disabled={busy}
                      onSelect={(next) => setPaymentStatus(o.id, next)}
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <StatusDropdown
                      label={`Change order status for order ${o.orderNumber}`}
                      value={o.orderStatus}
                      options={ORDER_STATUSES}
                      variant={orderStatusVariant(o.orderStatus)}
                      disabled={busy}
                      onSelect={(next) => setOrderStatus(o.id, next)}
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    {/* .action-list — the PHP has TWO buttons here: a grey
                        btn-secondary eye linking to order-view.php, then the
                        red delete. The eye was missing from the first port. */}
                    <div className="flex gap-[0.4rem]">
                      <Link
                        href={`/admin/ecommerce/orders/${o.id}`}
                        title={`View order ${o.orderNumber}`}
                        className="inline-flex h-[34px] w-[34px] items-center justify-center rounded p-0 text-white transition-opacity hover:opacity-85"
                        style={{ backgroundColor: "#858796" }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        title={`Delete order ${o.orderNumber}`}
                        onClick={() => setDeleteTarget({ id: o.id, label: o.orderNumber })}
                        className="inline-flex h-[34px] w-[34px] items-center justify-center rounded p-0 text-white transition-opacity hover:opacity-85"
                        style={{ backgroundColor: "#ef4444" }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold mb-2">Confirm Delete?</h5>
            <p className="text-sm text-admin-gray-600 mb-4">
              You are going to delete order &quot;<strong>{deleteTarget.label}</strong>&quot;. Do you want to delete it?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
