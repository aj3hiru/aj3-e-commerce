"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";

export interface SalesHistoryRow {
  id: number;
  orderNumber: string;
  customerName: string;
  orderType: string;
  itemsSummary: string;
  itemCount: number;
  totalAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  createdAt: string;
  creditStatus: string | null;
}

export function SalesHistoryTable({ sales }: { sales: SalesHistoryRow[] }) {
  if (sales.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-admin-gray-200 py-16 text-center text-admin-gray-400">
        <Receipt className="w-10 h-10 mx-auto mb-3" />
        <p>No sales in this period.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
              <th className="py-3 px-4">Order #</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Items</th>
              <th className="py-3 px-4">Total</th>
              <th className="py-3 px-4">Payment</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-b border-admin-gray-100">
                <td className="py-2.5 px-4 font-medium">{s.orderNumber}</td>
                <td className="py-2.5 px-4">{s.customerName}</td>
                <td className="py-2.5 px-4">
                  <span className={`text-xs font-semibold rounded px-2 py-1 ${s.orderType === "offline" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                    {s.orderType === "offline" ? "Store" : "Online"}
                  </span>
                </td>
                <td className="py-2.5 px-4 max-w-[220px] truncate" title={s.itemsSummary}>{s.itemsSummary} ({s.itemCount})</td>
                <td className="py-2.5 px-4">₹{s.totalAmount.toFixed(2)}</td>
                <td className="py-2.5 px-4">
                  <span className={`text-xs font-semibold rounded px-2 py-1 text-white ${s.paymentStatus === "Paid" ? "bg-emerald-500" : "bg-amber-500"}`}>
                    {s.paymentStatus === "Paid" ? "Paid" : s.creditStatus === "paid" ? "Paid (Due Cleared)" : "Unpaid"}
                  </span>
                  <div className="text-xs text-admin-gray-400 mt-0.5">{s.paymentMethod}</div>
                </td>
                <td className="py-2.5 px-4">{new Date(s.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="py-2.5 px-4">
                  <Link href={`/admin/ecommerce/invoice/${s.id}`} target="_blank" className="text-admin-primary text-xs font-medium">
                    View Invoice
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
