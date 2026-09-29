"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Do your prices already include GST?" — used by billing, checkout, invoices and reports. */
export function TaxModeCard({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [inclusive, setInclusive] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(next: boolean) {
    if (next === inclusive || saving) return;
    setSaving(true);
    setMsg(null);
    const r = await fetch("/api/ecommerce/tax-mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pricesIncludeTax: next }) })
      .then((x) => x.json()).catch(() => null);
    setSaving(false);
    if (!r?.success) { setMsg({ ok: false, text: r?.message || "Could not save. Please try again." }); return; }
    setInclusive(next);
    setMsg({ ok: true, text: "Saved. New bills and orders use this from now on." });
    router.refresh();
  }

  const opt = (value: boolean, title: string, example: string) => (
    <button type="button" onClick={() => save(value)} disabled={saving} aria-pressed={inclusive === value}
      className={cn("flex flex-1 items-start gap-3 rounded-lg border p-3.5 text-left transition-colors",
        inclusive === value ? "border-admin-primary bg-admin-primary-lighter" : "border-admin-gray-200 hover:border-admin-gray-300")}>
      <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2", inclusive === value ? "border-admin-primary" : "border-admin-gray-300")}>
        {inclusive === value && <span className="h-2 w-2 rounded-full bg-admin-primary" />}
      </span>
      <span>
        <span className="block text-sm font-semibold text-admin-gray-900">{title}</span>
        <span className="mt-0.5 block text-xs text-admin-gray-500">{example}</span>
      </span>
    </button>
  );

  return (
    <section className="mb-5 rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[0.5rem] bg-admin-primary-lighter text-admin-primary"><Receipt className="h-4 w-4" /></span>
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-admin-gray-900">Prices and GST</h2>
          <p className="text-xs text-admin-gray-500">How the price you type for a product treats GST — used in billing, checkout, invoices and GST reports.</p>
        </div>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-admin-gray-400" />}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {opt(true, "Prices include GST", "₹118 product at 18% → customer pays ₹118 (₹100 + ₹18 GST inside)")}
        {opt(false, "GST added on top", "₹100 product at 18% → customer pays ₹118 (₹18 GST added)")}
      </div>
      {msg && (
        <p className={cn("mt-3 flex items-center gap-1.5 text-xs", msg.ok ? "text-emerald-600" : "text-red-600")}>
          {msg.ok && <CheckCircle2 className="h-3.5 w-3.5" />}{msg.text}
        </p>
      )}
    </section>
  );
}
