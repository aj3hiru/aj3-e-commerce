"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  CreditCard, Banknote, Smartphone, Landmark, CheckCircle2, AlertCircle, X, Loader2, Settings2, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { PaymentMethodDef } from "@/lib/payment-methods";

export interface PaymentMethod2Row {
  key: string;
  label: string;
  description: string; // static, customer-facing blurb per gateway — see PAYMENT_METHODS
  fields: PaymentMethodDef["fields"];
  name: string;
  text: string;
  config: Record<string, string>;
  isEnabled: boolean;
  isDefault: boolean;
  configured: boolean; // every required field filled (COD, no fields, is always configured)
}

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  cod: Banknote, paytm: Smartphone, phonepe: Smartphone, razorpay: CreditCard, bank_transfer: Landmark,
};

const CARD = "rounded-xl border border-admin-gray-200 bg-white shadow-sm";

export function PaymentSettings2Body({ methods: initial }: { methods: PaymentMethod2Row[] }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [methods, setMethods] = useState(initial);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [configuring, setConfiguring] = useState<PaymentMethod2Row | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const markBusy = (key: string, on: boolean) => setBusy((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });
  const notify = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 3500); };

  const stats = {
    enabled: methods.filter((m) => m.isEnabled).length,
    configured: methods.filter((m) => m.configured).length,
    defaultMethod: methods.find((m) => m.isDefault) ?? null,
  };

  async function toggleEnabled(m: PaymentMethod2Row) {
    markBusy(m.key, true);
    const next = !m.isEnabled;
    if (next && !m.configured) {
      markBusy(m.key, false);
      setConfiguring(m);
      return;
    }
    const ok = await fetch(`/api/ecommerce/payment-settings2/${m.key}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isEnabled: next }) })
      .then(async (r) => r.ok && (await r.json().catch(() => ({}))).success === true).catch(() => false);
    markBusy(m.key, false);
    if (ok) {
      setMethods((l) => l.map((x) => (x.key === m.key ? { ...x, isEnabled: next, isDefault: next ? x.isDefault : false } : x)));
      notify(true, `${m.label} ${next ? "enabled" : "disabled"}.`);
      router.refresh();
    } else notify(false, "Couldn't save the change. Please try again.");
  }

  async function setDefault(m: PaymentMethod2Row) {
    if (!m.isEnabled) { notify(false, "Enable this method before making it the default."); return; }
    markBusy(m.key, true);
    const res = await fetch(`/api/ecommerce/payment-settings2/${m.key}/default`, { method: "POST" }).then((r) => r.json()).catch(() => ({ success: false }));
    markBusy(m.key, false);
    if (res.success) { setMethods((l) => l.map((x) => ({ ...x, isDefault: x.key === m.key }))); notify(true, `${m.label} is now the default payment method.`); router.refresh(); }
    else notify(false, res.message ?? "Couldn't set the default.");
  }

  return (
    <div className={cn("mt-5 space-y-5", !loaded && "invisible")}>
      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-700">
        <span className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" /> Credentials are stored server-side and never shown to customers.</span>
      </div>

      {show("pm2-cards") && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {show("pm2-k-enabled") && <StatCard icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" value={String(stats.enabled)} label="Enabled Methods" />}
          {show("pm2-k-configured") && <StatCard icon={Settings2} tint="bg-blue-50 text-blue-600" value={String(stats.configured)} label="Configured Methods" />}
          {show("pm2-k-default") && <StatCard icon={ShieldCheck} tint="bg-violet-50 text-violet-600" value={stats.defaultMethod?.label ?? "None set"} label="Default Method" />}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <section className={cn(CARD, "p-5 sm:p-6")}>
          <h3 className="mb-1 text-base font-bold text-admin-gray-900">Payment Methods</h3>
          <p className="mb-4 text-sm text-admin-gray-500">Turn methods on and configure their gateway credentials.</p>
          <div className="divide-y divide-admin-gray-100">
            {methods.map((m) => {
              const Icon = ICON[m.key] ?? CreditCard;
              const isBusy = busy.has(m.key);
              return (
                <div key={m.key} className={cn("flex flex-col gap-3 py-4 sm:flex-row sm:items-center", isBusy && "opacity-60")}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.5rem] bg-admin-gray-50 text-admin-gray-600"><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-admin-gray-900">{m.label}</span>
                      {m.isDefault && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">Default</span>}
                      {m.isEnabled && !m.configured && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Needs setup</span>}
                    </div>
                    <p className="text-sm text-admin-gray-500">{m.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => toggleEnabled(m)} disabled={isBusy} role="switch" aria-checked={m.isEnabled} aria-label={`${m.isEnabled ? "Disable" : "Enable"} ${m.label}`}
                      className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60", m.isEnabled ? "bg-[#2563eb]" : "bg-admin-gray-300")}>
                      <span className={cn("inline-block h-[18px] w-[18px] transform rounded-full bg-white transition-transform", m.isEnabled ? "translate-x-[22px]" : "translate-x-[3px]")} />
                    </button>
                    <span className="w-16 text-sm font-medium text-admin-gray-700">{m.isEnabled ? "Active" : "Inactive"}</span>
                    <button type="button" onClick={() => setConfiguring(m)}
                      className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 text-sm font-medium text-[#374151] hover:bg-[#f9fafb]">
                      <Settings2 className="h-3.5 w-3.5" /> Configure
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {show("pm2-default-panel") && (
          <aside className={cn(CARD, "h-fit p-5")}>
            <h3 className="mb-1 text-base font-bold text-admin-gray-900">Default Payment Method</h3>
            <p className="mb-4 text-sm text-admin-gray-500">Pre-selected at checkout. Customers can still choose another.</p>
            <div className="space-y-1">
              {methods.map((m) => (
                <label key={m.key} className={cn("flex cursor-pointer items-center gap-3 rounded-[0.5rem] px-3 py-2.5 text-sm", !m.isEnabled && "cursor-not-allowed opacity-50")}>
                  <input type="radio" name="pm2-default" checked={m.isDefault} disabled={!m.isEnabled || busy.has(m.key)} onChange={() => setDefault(m)} className="h-4 w-4 accent-[#2563eb]" />
                  <span className="flex-1 font-medium text-admin-gray-900">{m.label}</span>
                  {!m.isEnabled && <span className="text-xs text-admin-gray-400">Disabled</span>}
                </label>
              ))}
            </div>
          </aside>
        )}
      </div>

      {configuring && (
        <ConfigureModal
          method={configuring}
          onClose={() => setConfiguring(null)}
          onSaved={(updated) => { setMethods((l) => l.map((x) => (x.key === updated.key ? updated : x))); setConfiguring(null); notify(true, `${updated.label} settings saved.`); router.refresh(); }}
        />
      )}
      {toast && createPortal(
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-[0.5rem] border px-4 py-3 text-sm shadow-lg", toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>, document.body
      )}
    </div>
  );
}

function StatCard({ icon: Icon, tint, value, label }: { icon: React.ComponentType<{ className?: string }>; tint: string; value: string; label: string }) {
  return (
    <div className={cn(CARD, "flex items-center gap-4 px-5 py-4")}>
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tint)}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0"><span className="block truncate text-xl font-bold leading-tight text-admin-gray-900">{value}</span><span className="block text-sm text-admin-gray-600">{label}</span></span>
    </div>
  );
}

function ConfigureModal({ method, onClose, onSaved }: { method: PaymentMethod2Row; onClose: () => void; onSaved: (m: PaymentMethod2Row) => void }) {
  const [text, setText] = useState(method.text);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(method.fields.map((f) => [f.key, method.config[f.key] ?? ""])));
  const [enable, setEnable] = useState(method.isEnabled);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const form = new FormData();
    form.set("name", method.label);
    form.set("text", text);
    form.set("is_enabled", enable ? "1" : "0");
    for (const f of method.fields) form.set(`field_${f.key}`, values[f.key] ?? "");
    try {
      const res = await fetch(`/api/ecommerce/payment-settings2/${method.key}`, { method: "PUT", body: form });
      const data = await res.json();
      if (!data.success) { setErr(data.message); setBusy(false); return; }
      const configured = method.fields.length === 0 || method.fields.every((f) => (values[f.key] ?? "").trim() !== "");
      onSaved({ ...method, text, config: values, isEnabled: enable, configured, isDefault: enable ? method.isDefault : false });
    } catch { setErr("Could not reach the server. Please try again."); setBusy(false); }
  }

  const inputCls = "h-11 w-full rounded-[0.375rem] border border-[#dee2e6] px-3 text-[15px] outline-none transition-[border-color,box-shadow] focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15";

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <form onSubmit={save} role="dialog" aria-modal="true" className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#dee2e6] bg-[#f8f9fa] px-6 py-4">
          <h5 className="text-xl font-semibold text-admin-gray-900">Configure {method.label}</h5>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-admin-gray-500 hover:bg-admin-gray-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {err && <div role="alert" className="rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
          {method.fields.length === 0 ? (
            <p className="rounded-[0.5rem] bg-admin-gray-50 px-3 py-2.5 text-sm text-admin-gray-600">This method needs no API credentials — just turn it on.</p>
          ) : method.fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">{f.label}</label>
              {f.type === "select" ? (
                <select value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={inputCls}>
                  <option value="">Select…</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={inputCls} autoComplete="off" />
              )}
            </div>
          ))}
          <div>
            <label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Customer-facing note <span className="text-sm font-normal text-admin-gray-500">(optional)</span></label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Shown to customers at checkout next to this method"
              className="w-full resize-none rounded-[0.375rem] border border-[#dee2e6] px-3 py-2.5 text-[15px] outline-none focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15" />
          </div>
          <label className="flex items-center gap-2.5 text-sm font-medium text-admin-gray-900">
            <input type="checkbox" checked={enable} onChange={(e) => setEnable(e.target.checked)} className="h-4 w-4 accent-[#2563eb]" /> Enable this payment method
          </label>
        </div>
        <div className="flex items-center gap-2 border-t border-[#dee2e6] px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy} className="ml-auto h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-[15px] font-medium text-white hover:bg-[#5c636a]">Cancel</button>
          <button type="submit" disabled={busy} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-[15px] font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save Changes
          </button>
        </div>
      </form>
    </div>, document.body
  );
}
