"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, ChevronDown, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

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

const ORDER_STATUSES = ["Pending", "In Progress", "Delivered", "Canceled"] as const;
const ORDER_STATUS_STYLES: Record<string, string> = {
  Pending: "bg-amber-500",
  "In Progress": "bg-sky-500",
  Delivered: "bg-emerald-500",
  Canceled: "bg-red-500",
};

interface OrdersTableProps {
  orders: OrderRow[];
  currentType: string;
}

/** Verified against the #admin-table markup + status dropdowns in orders.php. */
export function OrdersTable({ orders, currentType }: OrdersTableProps) {
  const router = useRouter();
  const [openDropdown, setOpenDropdown] = useState<{ id: number; kind: "payment" | "order" } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function setOrderStatus(id: number, orderStatus: string) {
    setOpenDropdown(null);
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
    setOpenDropdown(null);
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
      <div className="bg-white rounded-lg border border-admin-gray-200 py-16 text-center text-admin-gray-400">
        <Receipt className="w-10 h-10 mx-auto mb-3" />
        <p>No orders found{currentType ? " for this status" : ""}.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Address</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Status</th>
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
                  <td className="py-2.5 px-4">₹{o.totalAmount.toFixed(2)}</td>
                  <td className="py-2.5 px-4">
                    <div className="relative inline-block">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setOpenDropdown(openDropdown?.id === o.id && openDropdown.kind === "payment" ? null : { id: o.id, kind: "payment" })}
                        className={cn(
                          "flex items-center gap-1 text-xs font-semibold rounded px-2.5 py-1.5",
                          o.paymentStatus === "Paid" ? "bg-emerald-500 text-white" : "bg-admin-gray-400 text-white"
                        )}
                      >
                        {o.paymentStatus} <ChevronDown className="w-3 h-3" />
                      </button>
                      {openDropdown?.id === o.id && openDropdown.kind === "payment" && (
                        <div className="absolute z-10 mt-1 bg-white border border-admin-gray-200 rounded shadow-lg min-w-[100px]">
                          <button className="block w-full text-left px-3 py-1.5 text-xs hover:bg-admin-gray-50" onClick={() => setPaymentStatus(o.id, "Paid")}>Paid</button>
                          <button className="block w-full text-left px-3 py-1.5 text-xs hover:bg-admin-gray-50" onClick={() => setPaymentStatus(o.id, "Unpaid")}>Unpaid</button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="relative inline-block">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setOpenDropdown(openDropdown?.id === o.id && openDropdown.kind === "order" ? null : { id: o.id, kind: "order" })}
                        className={cn(
                          "flex items-center gap-1 text-xs font-semibold rounded px-2.5 py-1.5 text-white",
                          ORDER_STATUS_STYLES[o.orderStatus] ?? "bg-admin-gray-400"
                        )}
                      >
                        {o.orderStatus} <ChevronDown className="w-3 h-3" />
                      </button>
                      {openDropdown?.id === o.id && openDropdown.kind === "order" && (
                        <div className="absolute z-10 mt-1 bg-white border border-admin-gray-200 rounded shadow-lg min-w-[120px]">
                          {ORDER_STATUSES.map((s) => (
                            <button key={s} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-admin-gray-50" onClick={() => setOrderStatus(o.id, s)}>
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ id: o.id, label: o.orderNumber })}
                      className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
