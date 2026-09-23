"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Percent, Star, TrendingUp, PackageSearch, Pencil, Trash2, Loader2, CheckCircle2, AlertCircle, X, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { formatInt } from "@/lib/format";

export interface TaxRate2Row {
  id: number;
  label: string;
  rate: number;
  isDefault: boolean;
  productCount: number; // real count — ecom_products whose gst_rate equals this slab's rate
}

const EVT_ADD = "tax2:add";
export function Tax2AddButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_ADD))}
      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-[#2563eb] px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]">
      <Plus className="h-4 w-4" /> Add Slab
    </button>
  );
}

const CARD = "rounded-xl border border-admin-gray-200 bg-white shadow-sm";

export function TaxSettings2Body({ rates: initial, orphanProducts }: { rates: TaxRate2Row[]; orphanProducts: number }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [rates, setRates] = useState(initial);
  useEffect(() => setRates(initial), [initial]);

  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<TaxRate2Row | "new" | null>(null);
  const [confirm, setConfirm] = useState<TaxRate2Row | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const notify = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    const onAdd = () => setEditing("new");
    window.addEventListener(EVT_ADD, onAdd);
    return () => window.removeEventListener(EVT_ADD, onAdd);
  }, []);

  const stats = useMemo(() => {
    const def = rates.find((r) => r.isDefault);
    const highest = rates.reduce((m, r) => (r.rate > m ? r.rate : m), 0);
    return { total: rates.length, defaultLabel: def ? `${def.rate}%` : "None set", highest: rates.length ? `${highest}%` : "—" };
  }, [rates]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rates.filter((r) => !term || r.label.toLowerCase().includes(term) || String(r.rate).includes(term));
  }, [rates, q]);

  const markBusy = (id: number, on: boolean) => setBusy((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  async function setDefault(r: TaxRate2Row) {
    markBusy(r.id, true);
    const ok = await fetch(`/api/ecommerce/tax-rates2/${r.id}`, { method: "PATCH" }).then(async (res) => res.ok && (await res.json().catch(() => ({}))).success === true).catch(() => false);
    markBusy(r.id, false);
    if (ok) { setRates((l) => l.map((x) => ({ ...x, isDefault: x.id === r.id }))); notify(true, `"${r.label}" is now the default GST rate.`); router.refresh(); }
    else notify(false, "Couldn't set the default. Please try again.");
  }

  async function remove(r: TaxRate2Row) {
    setConfirm(null);
    markBusy(r.id, true);
    const ok = await fetch(`/api/ecommerce/tax-rates2/${r.id}`, { method: "DELETE" }).then(async (res) => res.ok && (await res.json().catch(() => ({}))).success === true).catch(() => false);
    markBusy(r.id, false);
    if (ok) { setRates((l) => l.filter((x) => x.id !== r.id)); notify(true, `"${r.label}" deleted.`); router.refresh(); }
    else notify(false, "Couldn't delete this GST slab. Please try again.");
  }

  const td = "border border-[#dee2e6] px-3 py-2.5 align-middle";

  return (
    <div className={cn("mt-5 space-y-5", !loaded && "invisible")}>
      {show("tx2-cards") && (
        <div className="grid grid-cols-2 gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {show("tx2-k-total") && <StatCard icon={Percent} tint="bg-violet-50 text-violet-600" value={String(stats.total)} label="Total Slabs" />}
          {show("tx2-k-default") && <StatCard icon={Star} tint="bg-amber-50 text-amber-600" value={stats.defaultLabel} label="Default Rate" />}
          {show("tx2-k-highest") && <StatCard icon={TrendingUp} tint="bg-blue-50 text-blue-600" value={stats.highest} label="Highest Rate" />}
          {show("tx2-k-orphan") && <StatCard icon={PackageSearch} tint="bg-red-50 text-red-500" value={String(orphanProducts)} label="Products Without a Matching Slab" />}
        </div>
      )}

      {show("tx2-table") && (
      <section className={cn(CARD, "p-5 sm:p-7")}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="text-base font-bold text-admin-gray-900">GST Slabs</h3>
          {show("tx2-t-search") && (
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search slabs…" aria-label="Search GST slabs"
              className="ml-auto h-10 w-[220px] rounded-[0.375rem] border border-[#dee2e6] px-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
          )}
        </div>

        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-admin-gray-400">
            {rates.length === 0 ? <>No GST slabs yet. <button type="button" onClick={() => setEditing("new")} className="font-semibold text-[#2563eb] hover:underline">Add your first slab</button></> : "No slabs match this search."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[15px]">
              <thead>
                <tr className="bg-[#f8f9fa] text-left">
                  {show("tx2-c-label") && <th className={cn(td, "font-bold text-admin-gray-900")}>Label</th>}
                  {show("tx2-c-rate") && <th className={cn(td, "font-bold text-admin-gray-900")}>Rate</th>}
                  {show("tx2-c-products") && <th className={cn(td, "font-bold text-admin-gray-900")}>Products</th>}
                  {show("tx2-c-default") && <th className={cn(td, "font-bold text-admin-gray-900")}>Default</th>}
                  {show("tx2-c-actions") && <th className={cn(td, "font-bold text-admin-gray-900")}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isBusy = busy.has(r.id);
                  return (
                    <tr key={r.id} className={cn("odd:bg-[#f2f2f2] even:bg-white", isBusy && "opacity-60")}>
                      {show("tx2-c-label") && (
                        <td className={td}>
                          <button type="button" onClick={() => setEditing(r)} className="font-medium text-admin-gray-900 hover:text-[#2563eb] hover:underline">{r.label}</button>
                        </td>
                      )}
                      {show("tx2-c-rate") && <td className={td}>{r.rate}%</td>}
                      {show("tx2-c-products") && <td className={td}>{r.productCount > 0 ? formatInt(r.productCount) : <span className="text-admin-gray-400">0</span>}</td>}
                      {show("tx2-c-default") && (
                        <td className={td}>
                          {r.isDefault ? (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> Default</span>
                          ) : (
                            <button type="button" disabled={isBusy} onClick={() => setDefault(r)} className="text-xs font-medium text-[#2563eb] hover:underline disabled:opacity-50">Set as default</button>
                          )}
                        </td>
                      )}
                      {show("tx2-c-actions") && (
                        <td className={td}>
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => setEditing(r)} title={`Edit ${r.label}`} className="flex h-8 w-8 items-center justify-center rounded-[0.375rem] bg-[#eef2ff] text-[#2563eb] hover:bg-[#2563eb] hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
                            <button type="button" disabled={isBusy} onClick={() => setConfirm(r)} title={`Delete ${r.label}`} className="flex h-8 w-8 items-center justify-center rounded-[0.375rem] bg-red-50 text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {editing && (
        <RateModal rate={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(label, isNew) => { setEditing(null); notify(true, `"${label}" ${isNew ? "added" : "saved"}.`); router.refresh(); }}
          onDelete={editing === "new" ? undefined : () => { const r = editing; setEditing(null); setConfirm(r); }}
        />
      )}
      {confirm && (
        createPortal(
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirm(null)}>
            <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h5 className="mb-2 flex items-center gap-2 text-lg font-bold text-admin-gray-900"><Trash2 className="h-5 w-5 text-red-500" /> Delete &quot;{confirm.label}&quot;?</h5>
              <p className="text-sm text-admin-gray-600">
                This can&apos;t be undone.{confirm.productCount > 0 && <> <b>{formatInt(confirm.productCount)}</b> product{confirm.productCount === 1 ? "" : "s"} currently {confirm.productCount === 1 ? "has" : "have"} this exact rate — they keep their own rate value, only this named slab goes away.</>}
                {confirm.isDefault && <> This is the current default rate — deleting it leaves no default set.</>}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirm(null)} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
                <button type="button" autoFocus onClick={() => remove(confirm)} className="h-10 rounded-[0.375rem] bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>, document.body
        )
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
      <span className="min-w-0"><span className="block truncate text-2xl font-bold leading-tight text-admin-gray-900">{value}</span><span className="block text-sm text-admin-gray-600">{label}</span></span>
    </div>
  );
}

function RateModal({ rate, onClose, onSaved, onDelete }: {
  rate: TaxRate2Row | null; onClose: () => void; onSaved: (label: string, isNew: boolean) => void; onDelete?: () => void;
}) {
  const [label, setLabel] = useState(rate?.label ?? "");
  const [rateValue, setRateValue] = useState(rate ? String(rate.rate) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(rate ? `/api/ecommerce/tax-rates2/${rate.id}` : "/api/ecommerce/tax-rates2", {
        method: rate ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, rate: Number(rateValue) }),
      });
      const data = await res.json();
      if (!data.success) { setErr({ text: data.message, field: data.field }); setBusy(false); return; }
      onSaved(data.label, !rate);
    } catch { setErr({ text: "Could not reach the server. Please try again." }); setBusy(false); }
  }

  const inputCls = (bad: boolean) => cn("h-11 w-full rounded-[0.375rem] border px-3 text-[15px] outline-none transition-[border-color,box-shadow]",
    bad ? "border-red-400 focus:ring-4 focus:ring-red-100" : "border-[#dee2e6] focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15");

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <form onSubmit={save} role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#dee2e6] bg-[#f8f9fa] px-6 py-4">
          <h5 className="text-xl font-semibold text-admin-gray-900">{rate ? "Edit GST Slab" : "Add GST Slab"}</h5>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-admin-gray-500 hover:bg-admin-gray-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          {err && <div role="alert" className="rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err.text}</div>}
          <div>
            <label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Label</label>
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. GST 18%" className={inputCls(err?.field === "label")} />
          </div>
          <div>
            <label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Rate (%)</label>
            <input type="number" step="0.01" min={0} max={100} value={rateValue} onChange={(e) => setRateValue(e.target.value)} className={inputCls(err?.field === "rate")} />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-[#dee2e6] px-6 py-4">
          {onDelete && <button type="button" onClick={onDelete} disabled={busy} className="mr-auto flex h-10 items-center gap-1.5 rounded-[0.375rem] px-3 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>}
          <button type="button" onClick={onClose} disabled={busy} className={cn("h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-[15px] font-medium text-white hover:bg-[#5c636a]", !onDelete && "ml-auto")}>Cancel</button>
          <button type="submit" disabled={busy} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-[15px] font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {rate ? "Save Changes" : "Add Slab"}
          </button>
        </div>
      </form>
    </div>, document.body
  );
}
