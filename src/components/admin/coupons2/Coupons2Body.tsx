"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Tag, Calendar, Clock, TrendingUp, Copy, Check, Pencil, Files, Pause, Play, Trash2, Loader2,
  CheckCircle2, AlertCircle, X, ChevronLeft, ChevronRight, Download, Plus, Ticket, Globe, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { formatMoney, formatInt } from "@/lib/format";
import { relativeTime, type CouponActivityRow } from "@/lib/coupons2-activity";

export interface Coupon2Row {
  id: number;
  title: string;
  code: string;
  discountType: string; // "percentage" | "fixed"
  discountValue: number;
  appliesTo: string; // "all" | "product" | "category" | "subcategory"
  appliesToLabel: string; // resolved product/category/subcategory name, or "All Products"
  numberOfTimes: number;
  usedCount: number;
  status: string; // "active" | "inactive"
  isPaused: boolean;
  startsAt: string | null; // ISO
  endsAt: string | null;
  createdAt: string;
}

type ComputedStatus = "active" | "scheduled" | "expired" | "paused" | "inactive";
function computeStatus(c: Coupon2Row, now: number): ComputedStatus {
  if (c.isPaused) return "paused";
  if (c.status === "inactive") return "inactive";
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return "expired";
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return "scheduled";
  return "active";
}
const STATUS_META: Record<ComputedStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-700" },
  scheduled: { label: "Scheduled", cls: "bg-amber-50 text-amber-700" },
  expired: { label: "Expired", cls: "bg-admin-gray-100 text-admin-gray-500" },
  paused: { label: "Paused", cls: "bg-blue-50 text-blue-700" },
  inactive: { label: "Disabled", cls: "bg-red-50 text-red-600" },
};

type Tab = "all" | "active" | "scheduled" | "expired" | "paused";
const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" }, { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" }, { value: "expired", label: "Expired" },
  { value: "paused", label: "Paused" },
];

const EVT_ADD = "coupons2:add";
const EVT_EXPORT = "coupons2:export";

export function Coupons2HeaderButtons() {
  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_EXPORT))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#dee2e6] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]">
        <Download className="h-4 w-4" /> Export
      </button>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_ADD))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-[#2563eb] px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]">
        <Plus className="h-4 w-4" /> Create Coupon
      </button>
    </>
  );
}

const CARD = "rounded-xl border border-admin-gray-200 bg-white shadow-sm";
const PAGE_SIZE = 8;

interface Options { products: { id: number; name: string }[]; categories: { id: number; name: string }[]; subcategories: { id: number; name: string }[] }

export function Coupons2Body({ coupons: initial, activity, options }: { coupons: Coupon2Row[]; activity: CouponActivityRow[]; options: Options }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [coupons, setCoupons] = useState(initial);
  useEffect(() => setCoupons(initial), [initial]);
  const now = Date.now();

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Coupon2Row | "new" | null>(null);
  const [confirm, setConfirm] = useState<Coupon2Row | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const withStatus = useMemo(() => coupons.map((c) => ({ c, status: computeStatus(c, now) })), [coupons, now]);
  const stats = useMemo(() => ({
    active: withStatus.filter((x) => x.status === "active").length,
    scheduled: withStatus.filter((x) => x.status === "scheduled").length,
    expired: withStatus.filter((x) => x.status === "expired").length,
    redemptions: coupons.reduce((s, c) => s + c.usedCount, 0),
  }), [withStatus, coupons]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return withStatus.filter(({ c, status }) => {
      if (tab !== "all" && status !== tab) return false;
      if (term && !`${c.title} ${c.code}`.toLowerCase().includes(term)) return false;
      return true;
    }).map((x) => x.c);
  }, [withStatus, tab, q]);

  useEffect(() => setPage(1), [tab, q]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  function exportCsv(list: Coupon2Row[]) {
    const cell = (v: string | number) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [["Title", "Code", "Discount", "Applies To", "Used", "Limit", "Status", "Starts", "Ends"].join(",")];
    for (const c of list) {
      const st = computeStatus(c, now);
      lines.push([
        c.title, c.code, c.discountType === "percentage" ? `${c.discountValue}%` : formatMoney(c.discountValue),
        c.appliesToLabel, c.usedCount, c.numberOfTimes, STATUS_META[st].label, c.startsAt ?? "", c.endsAt ?? "",
      ].map(cell).join(","));
    }
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `coupons-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  useEffect(() => {
    const onAdd = () => setEditing("new");
    const onExport = () => exportCsv(filtered);
    window.addEventListener(EVT_ADD, onAdd);
    window.addEventListener(EVT_EXPORT, onExport);
    return () => { window.removeEventListener(EVT_ADD, onAdd); window.removeEventListener(EVT_EXPORT, onExport); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const markBusy = (id: number, on: boolean) => setBusy((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  async function togglePause(c: Coupon2Row) {
    markBusy(c.id, true);
    const next = !c.isPaused;
    const ok = await fetch(`/api/ecommerce/coupons2/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPaused: next }) })
      .then(async (r) => r.ok && (await r.json().catch(() => ({}))).success === true).catch(() => false);
    markBusy(c.id, false);
    if (ok) { setCoupons((l) => l.map((x) => (x.id === c.id ? { ...x, isPaused: next } : x))); setToast({ ok: true, text: `"${c.title}" ${next ? "paused" : "resumed"}.` }); router.refresh(); }
    else setToast({ ok: false, text: "Couldn't save the change. Please try again." });
  }

  async function duplicate(c: Coupon2Row) {
    markBusy(c.id, true);
    const res = await fetch(`/api/ecommerce/coupons2/${c.id}/duplicate`, { method: "POST" }).then((r) => r.json()).catch(() => ({ success: false }));
    markBusy(c.id, false);
    if (res.success) { setToast({ ok: true, text: `Duplicated as "${res.title}" (${res.code}) — paused, ready to edit.` }); router.refresh(); }
    else setToast({ ok: false, text: res.message ?? "Couldn't duplicate this coupon." });
  }

  async function remove(c: Coupon2Row) {
    setConfirm(null);
    markBusy(c.id, true);
    const ok = await fetch(`/api/ecommerce/coupons2/${c.id}`, { method: "DELETE" }).then(async (r) => r.ok && (await r.json().catch(() => ({}))).success === true).catch(() => false);
    markBusy(c.id, false);
    if (ok) { setCoupons((l) => l.filter((x) => x.id !== c.id)); setToast({ ok: true, text: `"${c.title}" deleted.` }); router.refresh(); }
    else setToast({ ok: false, text: "Couldn't delete this coupon. Please try again." });
  }

  return (
    <div className={cn("mt-5 space-y-5", !loaded && "invisible")}>
      {show("cp2-cards") && (
        <div className="grid grid-cols-2 gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {show("cp2-k-active") && <StatCard icon={Tag} tint="bg-emerald-50 text-emerald-600" value={stats.active} label="Active Coupons" />}
          {show("cp2-k-scheduled") && <StatCard icon={Calendar} tint="bg-amber-50 text-amber-600" value={stats.scheduled} label="Scheduled Coupons" />}
          {show("cp2-k-expired") && <StatCard icon={Clock} tint="bg-red-50 text-red-500" value={stats.expired} label="Expired Coupons" />}
          {show("cp2-k-redemptions") && <StatCard icon={TrendingUp} tint="bg-violet-50 text-violet-600" value={stats.redemptions} label="Total Redemptions" />}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          {show("cp2-search") && (
            <div className={cn(CARD, "flex flex-wrap items-center gap-3 p-3.5")}>
              <div className="flex flex-wrap items-center gap-1 rounded-[0.5rem] border border-[#dee2e6] p-1">
                {TABS.map((t) => (
                  <button key={t.value} type="button" onClick={() => setTab(t.value)}
                    className={cn("h-9 rounded-[0.375rem] px-3 text-sm font-medium transition-colors", tab === t.value ? "bg-[#2563eb] text-white" : "text-admin-gray-700 hover:bg-admin-gray-50")}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="relative ml-auto min-w-[200px] flex-1 sm:flex-none sm:w-[240px]">
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search coupons…" aria-label="Search coupons"
                  className="h-10 w-full rounded-[0.375rem] border border-[#dee2e6] px-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <div className={cn(CARD, "p-10 text-center text-sm text-admin-gray-400")}>
              {coupons.length === 0 ? <>No coupons yet. <button type="button" onClick={() => setEditing("new")} className="font-semibold text-[#2563eb] hover:underline">Create your first coupon</button></> : "No coupons match this filter."}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {rows.map((c) => (
                <CouponCard key={c.id} coupon={c} status={computeStatus(c, now)} busy={busy.has(c.id)}
                  onEdit={() => setEditing(c)} onPause={() => togglePause(c)} onDuplicate={() => duplicate(c)} onDelete={() => setConfirm(c)} />
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-admin-gray-700">
            <span>{filtered.length === 0 ? "Showing 0 results" : `Showing ${(current - 1) * PAGE_SIZE + 1} to ${(current - 1) * PAGE_SIZE + rows.length} of ${filtered.length} results`}</span>
            {pageCount > 1 && <Pager page={current} pageCount={pageCount} onPage={setPage} />}
          </div>
        </section>

        {show("cp2-activity-panel") && <RecentActivity activity={activity} />}
      </div>

      {editing && (
        <CouponModal coupon={editing === "new" ? null : editing} options={options}
          onClose={() => setEditing(null)}
          onSaved={(title, isNew) => { setEditing(null); setToast({ ok: true, text: `"${title}" ${isNew ? "created" : "saved"}.` }); router.refresh(); }}
          onDelete={editing === "new" ? undefined : () => { const c = editing; setEditing(null); setConfirm(c); }} />
      )}
      {confirm && (
        createPortal(
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirm(null)}>
            <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h5 className="mb-2 flex items-center gap-2 text-lg font-bold text-admin-gray-900"><Trash2 className="h-5 w-5 text-red-500" /> Delete &quot;{confirm.title}&quot;?</h5>
              <p className="text-sm text-admin-gray-600">This can&apos;t be undone. {confirm.usedCount > 0 && <>It has been used <b>{confirm.usedCount}</b> time{confirm.usedCount === 1 ? "" : "s"} — past orders keep their discount, only the code stops working.</>}</p>
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

/* ───────────────────────── pieces ───────────────────────── */

function StatCard({ icon: Icon, tint, value, label }: { icon: React.ComponentType<{ className?: string }>; tint: string; value: number; label: string }) {
  return (
    <div className={cn(CARD, "flex items-center gap-4 px-5 py-4")}>
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tint)}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0"><span className="block text-2xl font-bold leading-tight text-admin-gray-900">{formatInt(value)}</span><span className="block text-sm text-admin-gray-600">{label}</span></span>
    </div>
  );
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center gap-1.5 rounded-[0.375rem] border border-dashed border-[#93c5fd] bg-blue-50/50 px-3 py-1.5 font-mono text-sm font-bold tracking-wide text-[#2563eb] transition-colors hover:bg-blue-50">
      {code} {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CouponCard({ coupon: c, status, busy, onEdit, onPause, onDuplicate, onDelete }: {
  coupon: Coupon2Row; status: ComputedStatus; busy: boolean;
  onEdit: () => void; onPause: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const meta = STATUS_META[status];
  const discountText = c.discountType === "percentage" ? `${c.discountValue}%` : formatMoney(c.discountValue);
  const discountSub = c.discountType === "percentage" ? "Percentage" : "Fixed Amount";
  return (
    <div className={cn(CARD, "p-5", busy && "opacity-60")}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.5rem] bg-violet-50 text-violet-600"><Ticket className="h-5 w-5" /></span>
          <div>
            <div className="flex items-center gap-2"><h4 className="font-bold text-admin-gray-900">{c.title}</h4><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", meta.cls)}>{meta.label}</span></div>
            <CopyCode code={c.code} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-bold text-admin-gray-900">{discountText} OFF</div>
          <div className="text-xs text-admin-gray-500">{discountSub}</div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-admin-gray-600">
        <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-admin-gray-400" /> {c.appliesToLabel}</span>
        <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-admin-gray-400" /> {formatInt(c.usedCount)} / {formatInt(c.numberOfTimes)} used</span>
      </div>
      {(c.startsAt || c.endsAt) && (
        <div className="mb-4 flex items-center gap-1.5 text-sm text-admin-gray-600">
          <Calendar className="h-3.5 w-3.5 text-admin-gray-400" />
          {c.startsAt ? new Date(c.startsAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "No start date"}
          {" – "}
          {c.endsAt ? new Date(c.endsAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "No end date"}
        </div>
      )}

      <div className="flex items-center gap-1 border-t border-admin-gray-100 pt-3 text-sm">
        <button type="button" onClick={onEdit} className="flex items-center gap-1.5 rounded-[0.375rem] px-2.5 py-1.5 font-medium text-admin-gray-700 hover:bg-admin-gray-50"><Pencil className="h-3.5 w-3.5" /> Edit</button>
        <button type="button" onClick={onDuplicate} disabled={busy} className="flex items-center gap-1.5 rounded-[0.375rem] px-2.5 py-1.5 font-medium text-admin-gray-700 hover:bg-admin-gray-50 disabled:opacity-50"><Files className="h-3.5 w-3.5" /> Duplicate</button>
        <button type="button" onClick={onPause} disabled={busy} className="flex items-center gap-1.5 rounded-[0.375rem] px-2.5 py-1.5 font-medium text-admin-gray-700 hover:bg-admin-gray-50 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : c.isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />} {c.isPaused ? "Resume" : "Pause"}
        </button>
        <button type="button" onClick={onDelete} disabled={busy} className="ml-auto flex items-center gap-1.5 rounded-[0.375rem] px-2.5 py-1.5 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
      </div>
    </div>
  );
}

const ACTIVITY_ICON: Record<CouponActivityRow["action"], { icon: React.ComponentType<{ className?: string }>; tint: string }> = {
  create: { icon: CheckCircle2, tint: "bg-emerald-50 text-emerald-600" },
  update: { icon: Pencil, tint: "bg-blue-50 text-blue-600" },
  delete: { icon: Trash2, tint: "bg-red-50 text-red-600" },
  pause: { icon: Pause, tint: "bg-amber-50 text-amber-600" },
  resume: { icon: Play, tint: "bg-emerald-50 text-emerald-600" },
};

function RecentActivity({ activity }: { activity: CouponActivityRow[] }) {
  return (
    <aside className={cn(CARD, "h-fit p-5")}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-admin-gray-900">Recent Activity</h3>
      </div>
      {activity.length === 0 ? (
        <p className="py-6 text-center text-sm text-admin-gray-400">No coupon activity logged yet.</p>
      ) : (
        <ul className="space-y-4">
          {activity.map((a) => {
            const meta = ACTIVITY_ICON[a.action];
            const Icon = meta.icon;
            return (
              <li key={a.id} className="flex items-start gap-3">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", meta.tint)}><Icon className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-admin-gray-800">{a.description}</p>
                  <p className="text-xs text-admin-gray-400">{a.byUsername ? `By ${a.byUsername} · ` : ""}{relativeTime(a.createdAt)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/admin/activity-logs" className="mt-4 block rounded-[0.375rem] border border-[#dee2e6] py-2 text-center text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50">View All Activity</Link>
    </aside>
  );
}

function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = "flex h-9 min-w-9 items-center justify-center border border-[#dee2e6] px-2.5 text-sm -ml-px first:ml-0 first:rounded-l-[0.375rem] last:rounded-r-[0.375rem]";
  return (
    <nav className="flex" aria-label="Coupon pages">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={cn(btn, "text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300")}><ChevronLeft className="h-4 w-4" /></button>
      {nums.map((n, i) => n === "…" ? <span key={`e${i}`} className={cn(btn, "text-admin-gray-400")}>…</span> :
        <button key={n} type="button" onClick={() => onPage(n)} className={cn(btn, n === page ? "relative z-10 border-[#2563eb] bg-[#2563eb] text-white" : "text-[#2563eb] hover:bg-admin-gray-50")}>{n}</button>)}
      <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)} className={cn(btn, "text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300")}><ChevronRight className="h-4 w-4" /></button>
    </nav>
  );
}

/* ───────────────────────── modal ───────────────────────── */

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CouponModal({ coupon, options, onClose, onSaved, onDelete }: {
  coupon: Coupon2Row | null; options: Options; onClose: () => void; onSaved: (title: string, isNew: boolean) => void; onDelete?: () => void;
}) {
  const [title, setTitle] = useState(coupon?.title ?? "");
  const [code, setCode] = useState(coupon?.code ?? "");
  const [discountType, setDiscountType] = useState(coupon?.discountType ?? "percentage");
  const [discountValue, setDiscountValue] = useState(String(coupon?.discountValue ?? ""));
  const [numberOfTimes, setNumberOfTimes] = useState(String(coupon?.numberOfTimes ?? 100));
  const [appliesTo, setAppliesTo] = useState(coupon?.appliesTo ?? "all");
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(coupon?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(coupon?.endsAt ?? null));
  const [status, setStatus] = useState(coupon?.status === "inactive" ? "inactive" : "active");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body = {
      title, code, discountType, discountValue: Number(discountValue), numberOfTimes: Number(numberOfTimes),
      appliesTo, productId: productId ? Number(productId) : null, categoryId: categoryId ? Number(categoryId) : null,
      subcategoryId: subcategoryId ? Number(subcategoryId) : null,
      startsAt: startsAt || null, endsAt: endsAt || null, status, isPaused: coupon?.isPaused ?? false,
    };
    try {
      const res = await fetch(coupon ? `/api/ecommerce/coupons2/${coupon.id}` : "/api/ecommerce/coupons2", {
        method: coupon ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) { setErr({ text: data.message, field: data.field }); setBusy(false); return; }
      onSaved(data.title, !coupon);
    } catch { setErr({ text: "Could not reach the server. Please try again." }); setBusy(false); }
  }

  const inputCls = (bad: boolean) => cn("h-11 w-full rounded-[0.375rem] border px-3 text-[15px] outline-none transition-[border-color,box-shadow]",
    bad ? "border-red-400 focus:ring-4 focus:ring-red-100" : "border-[#dee2e6] focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15");

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <form onSubmit={save} role="dialog" aria-modal="true" className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#dee2e6] bg-[#f8f9fa] px-6 py-4">
          <h5 className="text-xl font-semibold text-admin-gray-900">{coupon ? "Edit Coupon" : "Create Coupon"}</h5>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-admin-gray-500 hover:bg-admin-gray-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {err && <div role="alert" className="rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err.text}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Title</label><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Welcome Offer" className={inputCls(err?.field === "title")} /></div>
            <div><label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Code</label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME10" className={cn(inputCls(err?.field === "code"), "font-mono uppercase")} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Discount Type</label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className={inputCls(false)}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₹)</option>
              </select>
            </div>
            <div><label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Discount Value</label><input type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={inputCls(err?.field === "discountValue")} /></div>
          </div>
          <div>
            <label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Applies To</label>
            <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)} className={cn(inputCls(false), "mb-2")}>
              <option value="all">All Products</option><option value="product">Specific Product</option>
              <option value="category">Specific Category</option><option value="subcategory">Specific Subcategory</option>
            </select>
            {appliesTo === "product" && <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inputCls(err?.field === "productId")}><option value="">Select a product…</option>{options.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
            {appliesTo === "category" && <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls(err?.field === "categoryId")}><option value="">Select a category…</option>{options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
            {appliesTo === "subcategory" && <select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} className={inputCls(err?.field === "subcategoryId")}><option value="">Select a subcategory…</option>{options.subcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Usage Limit</label><input type="number" min={1} value={numberOfTimes} onChange={(e) => setNumberOfTimes(e.target.value)} className={inputCls(false)} /></div>
            <div>
              <label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls(false)}><option value="active">Active</option><option value="inactive">Disabled</option></select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Starts <span className="text-sm font-normal text-admin-gray-500">(optional)</span></label><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls(false)} /></div>
            <div><label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Ends <span className="text-sm font-normal text-admin-gray-500">(optional)</span></label><input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputCls(err?.field === "endsAt")} /></div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-[#dee2e6] px-6 py-4">
          {onDelete && <button type="button" onClick={onDelete} disabled={busy} className="mr-auto flex h-10 items-center gap-1.5 rounded-[0.375rem] px-3 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>}
          <button type="button" onClick={onClose} disabled={busy} className={cn("h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-[15px] font-medium text-white hover:bg-[#5c636a]", !onDelete && "ml-auto")}>Cancel</button>
          <button type="submit" disabled={busy} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-[15px] font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {coupon ? "Save Changes" : "Create Coupon"}
          </button>
        </div>
      </form>
    </div>, document.body
  );
}
