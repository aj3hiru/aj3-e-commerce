"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HandCoins, History, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DueRow {
  id: number;
  customerName: string;
  customerPhone: string | null;
  orderId: number | null;
  orderNumber: string | null;
  amount: number;
  amountPaid: number;
  promisedDate: string | null; // ISO date
  status: string;
  isOverdue: boolean;
  history: { receiptNumber: string; amount: number; paymentMethod: string; createdAt: string }[];
}

interface DueTableProps {
  credits: DueRow[];
  currentFilter: string;
}

const FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "due", label: "Due / Overdue" },
  { value: "paid", label: "Paid" },
  { value: "all", label: "All" },
];

export function DueTable({ credits, currentFilter }: DueTableProps) {
  const router = useRouter();
  const [historyOpen, setHistoryOpen] = useState<number | null>(null);
  const [payModal, setPayModal] = useState<DueRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setPromisedDate(id: number, date: string) {
    setBusy(true);
    try {
      await fetch("/api/ecommerce/due/set-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditId: id, promisedDate: date || null }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payModal) return;
    const balance = payModal.amount - payModal.amountPaid;
    const amt = Math.min(Math.max(0, parseFloat(payAmount) || 0), balance);
    if (amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ecommerce/due-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditIds: [payModal.id], amounts: [amt], paymentMethod: payMethod, combineReceipt: false }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message);
        return;
      }
      router.push(data.redirect);
      router.refresh();
      setPayModal(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex rounded-md overflow-hidden border border-admin-gray-300 w-fit mb-4">
        {FILTERS.map((f) => (
          <a
            key={f.value}
            href={`?filter=${f.value}`}
            className={cn(
              "px-3 py-1.5 text-[0.8125rem] border-r border-admin-gray-300 last:border-r-0",
              currentFilter === f.value ? "bg-admin-primary text-white" : "bg-white text-admin-gray-700 hover:bg-admin-gray-50"
            )}
          >
            {f.label}
          </a>
        ))}
      </div>

      {credits.length === 0 ? (
        <div className="bg-white rounded-lg border border-admin-gray-200 py-16 text-center text-admin-gray-400">
          <HandCoins className="w-10 h-10 mx-auto mb-3" />
          <p>No records here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">From Order</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Paid</th>
                  <th className="py-3 px-4">Balance</th>
                  <th className="py-3 px-4">Promised Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {credits.map((c) => {
                  const balance = c.amount - c.amountPaid;
                  return (
                    <>
                      <tr key={c.id} className={cn("border-b border-admin-gray-100", c.isOverdue && "bg-red-50")}>
                        <td className="py-2.5 px-4 font-medium">{c.customerName}</td>
                        <td className="py-2.5 px-4">{c.customerPhone || "—"}</td>
                        <td className="py-2.5 px-4">
                          {c.orderNumber ? (
                            <Link href={`/admin/ecommerce/invoice/${c.orderId}`} target="_blank" className="text-admin-primary">{c.orderNumber}</Link>
                          ) : "—"}
                        </td>
                        <td className="py-2.5 px-4">₹{c.amount.toFixed(2)}</td>
                        <td className="py-2.5 px-4">
                          ₹{c.amountPaid.toFixed(2)}
                          {c.history.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setHistoryOpen(historyOpen === c.id ? null : c.id)}
                              className="flex items-center gap-1 text-xs text-admin-primary mt-1"
                            >
                              <History className="w-3 h-3" /> History ({c.history.length})
                            </button>
                          )}
                        </td>
                        <td className={cn("py-2.5 px-4 font-bold", balance > 0 ? "text-red-600" : "text-emerald-600")}>₹{balance.toFixed(2)}</td>
                        <td className="py-2.5 px-4">
                          <input
                            type="date"
                            defaultValue={c.promisedDate ?? ""}
                            disabled={busy}
                            onBlur={(e) => setPromisedDate(c.id, e.target.value)}
                            className="border border-admin-gray-200 rounded px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={cn("text-xs font-semibold rounded px-2 py-1", c.status === "paid" ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")}>
                            {c.status === "paid" ? "Paid" : "Pending"}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          {balance > 0.004 && (
                            <button
                              type="button"
                              onClick={() => { setPayModal(c); setPayAmount(balance.toFixed(2)); setPayMethod("Cash"); }}
                              className="flex items-center gap-1 bg-admin-primary hover:bg-admin-primary-dark text-white text-xs font-medium rounded px-2.5 py-1.5"
                            >
                              <HandCoins className="w-3 h-3" /> Record Payment
                            </button>
                          )}
                        </td>
                      </tr>
                      {historyOpen === c.id && c.history.length > 0 && (
                        <tr key={`${c.id}-history`}>
                          <td colSpan={9} className="bg-admin-gray-50 px-4 py-3">
                            <div className="text-sm space-y-1">
                              {c.history.map((h, i) => (
                                <div key={i} className="flex justify-between border-b border-dashed border-admin-gray-200 pb-1 last:border-0">
                                  <span>{h.receiptNumber} — {h.paymentMethod}</span>
                                  <span>₹{h.amount.toFixed(2)} · {new Date(h.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setPayModal(null)}>
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold text-lg mb-1">Record Payment</h5>
            <p className="text-sm text-admin-gray-500 mb-4">
              {payModal.customerName} — Balance: ₹{(payModal.amount - payModal.amountPaid).toFixed(2)}
            </p>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{error}</div>}
            <form onSubmit={submitPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  max={payModal.amount - payModal.amountPaid}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Payment Method</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setPayModal(null)} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">Cancel</button>
                <button type="submit" disabled={busy} className="px-4 py-2 text-sm rounded bg-admin-primary text-white hover:bg-admin-primary-dark disabled:opacity-60">
                  {busy ? "Saving…" : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
