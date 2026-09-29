"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, HandCoins, Loader2, Printer, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/admin/campaigns2/ui";
import { PillButton } from "@/components/admin/ui/buttons";

/** One payment taken against a due, with its receipt number. */
export interface DueReceipt { receiptNumber: string; amount: number; paymentMethod: string; createdAt: string; by?: string | null }

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const receiptUrl = (n: string) => `/admin/ecommerce/payment-receipt/${encodeURIComponent(n)}`;

/**
 * Receipt icon with ×N (as on the Due page): click to see every receipt of the
 * due — each opens on its own, or print them all at once.
 */
export function ReceiptsButton({ receipts, title }: { receipts: DueReceipt[]; title: string }) {
  const [open, setOpen] = useState(false);
  if (receipts.length === 0) return null;
  const total = receipts.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <PillButton variant="secondary" onClick={() => setOpen(true)} title={`${receipts.length} payment receipt${receipts.length === 1 ? "" : "s"}`}>
        <Receipt className="h-3.5 w-3.5" /> ×{receipts.length}
      </PillButton>
      {open && (
        <Modal
          title={`Receipts — ${title}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <span className="mr-auto text-sm text-admin-gray-600">Collected <b className="text-emerald-600">{money(total)}</b> in {receipts.length} part{receipts.length === 1 ? "" : "s"}</span>
              <button type="button" onClick={() => receipts.forEach((r) => window.open(`${receiptUrl(r.receiptNumber)}?print=1`, "_blank"))}
                className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]">
                <Printer className="h-4 w-4" /> Open all
              </button>
            </>
          }
        >
          <div className="overflow-hidden rounded-[0.5rem] border border-admin-gray-200">
            {receipts.map((r, i) => (
              <div key={`${r.receiptNumber}-${i}`} className="flex items-center gap-3 border-b border-admin-gray-100 px-3.5 py-2.5 text-sm last:border-b-0">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-admin-gray-100 text-xs font-bold text-admin-gray-600">{i + 1}×</span>
                <span className="min-w-0 flex-1">
                  <Link href={receiptUrl(r.receiptNumber)} target="_blank" className="block truncate font-medium text-[#2563eb] hover:underline">{r.receiptNumber}</Link>
                  <span className="block text-xs text-admin-gray-500">{when(r.createdAt)} · {r.paymentMethod}{r.by ? ` · by ${r.by}` : ""}</span>
                </span>
                <b className="shrink-0 text-emerald-600">{money(r.amount)}</b>
                <Link href={receiptUrl(r.receiptNumber)} target="_blank" aria-label={`Open ${r.receiptNumber}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-admin-gray-500 hover:bg-admin-gray-100"><ExternalLink className="h-4 w-4" /></Link>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

const METHODS = ["Cash", "UPI", "Card", "Other"] as const;

/** "Collect" for one due, right where it is shown (customer profile, order page). */
export function CollectButton({ creditId, balance, label, onDone }: { creditId: number; balance: number; label: string; onDone?: (msg: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState<(typeof METHODS)[number]>("Cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (balance <= 0.004) return null;
  const value = Number(amount);
  const bad = !Number.isFinite(value) || value <= 0 || value > balance + 0.004;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (bad || saving) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/ecommerce/due-payment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creditIds: [creditId], amounts: [Math.min(value, balance)], paymentMethod: method, combineReceipt: true }),
    }).then((r) => r.json()).catch(() => null);
    setSaving(false);
    if (!res?.success) { setError(res?.message || "Could not record the payment. Please try again."); return; }
    setOpen(false);
    onDone?.(`${money(Math.min(value, balance))} collected.${res.receipts?.length ? ` Receipt: ${res.receipts.join(", ")}` : ""}`);
    router.refresh();
  }

  return (
    <>
      <PillButton variant="success" onClick={() => { setAmount(balance.toFixed(2)); setOpen(true); }} title={`Collect due on ${label}`}>
        <HandCoins className="h-3.5 w-3.5" /> Collect
      </PillButton>
      {open && (
        <Modal
          title={`Collect — ${label}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-4 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
              <button type="submit" form={`collect-${creditId}`} disabled={bad || saving} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#3d8b5f] px-5 text-sm font-semibold text-white hover:bg-[#33774f] disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Record {bad ? "" : money(Math.min(value, balance))}
              </button>
            </>
          }
        >
          <form id={`collect-${creditId}`} onSubmit={save} className="space-y-4" noValidate>
            <p className="text-sm text-admin-gray-600">Balance due: <b className="text-[#dc3545]">{money(balance)}</b></p>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-admin-gray-800">Amount</span>
              <span className="relative block">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-admin-gray-500">₹</span>
                <input autoFocus inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }}
                  className={cn("h-10 w-full rounded-[0.375rem] border bg-white pl-7 pr-3 text-sm outline-none focus:ring-4 focus:ring-[#0d6efd]/15", bad && amount !== "" ? "border-red-400" : "border-[#dee2e6] focus:border-[#86b7fe]")} />
              </span>
            </label>
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-admin-gray-800">Paid by</span>
              <div className="flex flex-wrap gap-2">
                {METHODS.map((m) => (
                  <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}
                    className={cn("h-10 rounded-[0.375rem] border px-4 text-sm font-medium", method === m ? "border-[#2563eb] bg-blue-50/60 text-[#2563eb]" : "border-admin-gray-200 bg-white text-admin-gray-700 hover:bg-admin-gray-50")}>{m}</button>
                ))}
              </div>
            </div>
            {error && <p role="alert" className="rounded-[0.375rem] bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          </form>
        </Modal>
      )}
    </>
  );
}
