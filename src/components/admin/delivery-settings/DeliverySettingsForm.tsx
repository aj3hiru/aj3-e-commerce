"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, IndianRupee, Loader2, Save, Store, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { deliveryChargeFor, type DeliverySettings } from "@/lib/delivery-charge-shared";

const INPUT = "w-full rounded-md border border-admin-gray-200 bg-white px-3 py-2 text-sm text-admin-gray-800 placeholder:text-admin-gray-400 focus:border-admin-primary focus:outline-none focus:ring-2 focus:ring-admin-primary/15";
const rs = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label="Charge for delivery" onClick={() => onChange(!on)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-admin-primary" : "bg-admin-gray-300")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

/** Form for Business Settings → Delivery Charge, with a live "what the customer pays" check. */
export function DeliverySettingsForm({ initial }: { initial: DeliverySettings }) {
  const [s, setS] = useState(initial);
  const [charge, setCharge] = useState(initial.charge ? String(initial.charge) : "");
  const [free, setFree] = useState(initial.freeAbove === null ? "" : String(initial.freeAbove));
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState("499");

  const current: DeliverySettings = { ...s, charge: Number(charge) || 0, freeAbove: free.trim() === "" ? null : Number(free) || 0 };
  const dirty = JSON.stringify(current) !== saved;

  async function save() {
    if (current.enabled && current.charge <= 0) { setMsg({ ok: false, text: "Enter the delivery charge (more than ₹0), or turn delivery charge off." }); return; }
    setBusy(true); setMsg(null);
    const res = await fetch("/api/ecommerce/delivery-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!res?.success) { setMsg({ ok: false, text: res?.message || "Couldn't save." }); return; }
    const v = res.settings as DeliverySettings;
    setS(v); setCharge(v.charge ? String(v.charge) : ""); setFree(v.freeAbove === null ? "" : String(v.freeAbove)); setSaved(JSON.stringify(v));
    setMsg({ ok: true, text: "Saved — checkout uses these rules now." });
  }

  const testAmount = Number(test) || 0;
  const testCharge = deliveryChargeFor(testAmount, current);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-admin-gray-800"><Truck className="h-5 w-5 text-admin-primary" />Delivery charge</h2>
        <p className="mb-4 text-xs text-admin-gray-500">Applies to online orders from the shop only. Bills made at the counter (Billing / POS) never have a delivery charge.</p>
        <div className="divide-y divide-admin-gray-100">
          <div className="flex items-start gap-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-admin-gray-800">Charge for delivery</p>
              <p className="text-xs text-admin-gray-500">Off: every online order is delivered free.</p>
            </div>
            <Switch on={s.enabled} onChange={(v) => setS((x) => ({ ...x, enabled: v }))} />
          </div>
          <div className={cn("grid gap-4 py-4 sm:grid-cols-2", !s.enabled && "pointer-events-none opacity-50")}>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-admin-gray-700">Delivery charge (₹)</span>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-400" />
                <input inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 40" className={cn(INPUT, "pl-8")} />
              </div>
              <span className="mt-1 block text-xs text-admin-gray-500">Added to orders below the free-delivery amount.</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-admin-gray-700">Free delivery on orders of (₹) or more</span>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-400" />
                <input inputMode="decimal" value={free} onChange={(e) => setFree(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 499 (leave empty: always charge)" className={cn(INPUT, "pl-8")} />
              </div>
              <span className="mt-1 block text-xs text-admin-gray-500">Items total, before GST. Below this amount the delivery charge is added.</span>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-admin-gray-700">Note shown at checkout (optional)</span>
              <input value={s.note} maxLength={200} onChange={(e) => setS((x) => ({ ...x, note: e.target.value }))} placeholder="e.g. Delivery within Narkatiaganj only" className={INPUT} />
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-admin-gray-800"><Store className="h-5 w-5 text-admin-primary" />Check it</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-admin-gray-700">
          <span>An order with items worth</span>
          <div className="relative w-32">
            <IndianRupee className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-400" />
            <input inputMode="decimal" value={test} onChange={(e) => setTest(e.target.value.replace(/[^\d.]/g, ""))} className={cn(INPUT, "pl-8")} />
          </div>
          <span>pays</span>
          <b className={cn("rounded-md px-2 py-1", testCharge > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>{testCharge > 0 ? `${rs(testCharge)} delivery` : "FREE delivery"}</b>
        </div>
      </section>

      {msg && (
        <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-3 text-sm", msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700")}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}{msg.text}
        </div>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={busy || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-admin-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Settings
        </button>
      </div>
    </div>
  );
}
