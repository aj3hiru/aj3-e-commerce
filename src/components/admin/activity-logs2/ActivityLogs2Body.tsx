"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity, CalendarClock, ShieldAlert, TriangleAlert, Search, Download, Trash2, X, ChevronDown,
  ChevronLeft, ChevronRight, Loader2, CheckCircle2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { actionLabel, classifySeverity, parseUserAgent, type LogSeverity } from "@/lib/activity-logs2";

export interface LogRow2 {
  id: number;
  username: string | null;
  email: string | null;
  role: string | null;
  actionType: string;
  description: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string; // ISO
}

const SEVERITY_META: Record<LogSeverity, { label: string; cls: string }> = {
  low: { label: "LOW", cls: "bg-emerald-50 text-emerald-700" },
  medium: { label: "MEDIUM", cls: "bg-amber-50 text-amber-700" },
  high: { label: "HIGH", cls: "bg-red-50 text-red-700" },
};

const CARD = "rounded-xl border border-admin-gray-200 bg-white shadow-sm";
const inputCls = "h-11 w-full rounded-[0.375rem] border border-[#dee2e6] px-3 text-sm outline-none focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15";

interface Props {
  logs: LogRow2[];
  stats: { total: number; today: number; security: number; failed: number };
  actions: string[]; // distinct actionType values present in the DB
  users: { username: string; email: string }[];
  filters: { action: string; user: string; severity: string; search: string; dateFrom: string; dateTo: string };
  page: number; totalPages: number; totalLogs: number; pageSize: number;
}

export function ActivityLogs2Body({ logs, stats, actions, users, filters, page, totalPages, totalLogs, pageSize }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [selected, setSelected] = useState<LogRow2 | null>(null);
  const [search, setSearch] = useState(filters.search);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const notify = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 4000); };

  function setParam(updates: Record<string, string>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) { if (v) sp.set(k, v); else sp.delete(k); }
    sp.delete("page");
    router.push(`?${sp.toString()}`);
  }
  function goPage(p: number) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("page", String(p));
    router.push(`?${sp.toString()}`);
  }

  useEffect(() => {
    const t = setTimeout(() => { if (search !== filters.search) setParam({ search }); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function exportCsv() {
    const cell = (v: string | number) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [["ID", "User", "Action", "Description", "IP", "Severity", "Date"].join(",")];
    for (const l of logs) {
      lines.push([`AL-${l.id}`, l.username ?? "System", actionLabel(l.actionType), l.description, l.ipAddress ?? "", SEVERITY_META[classifySeverity(l.actionType)].label, l.createdAt].map(cell).join(","));
    }
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `activity-logs-page${page}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function clearLogs() {
    setClearing(true);
    const res = await fetch("/api/activity-logs/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: filters.action, search: filters.search }) })
      .then((r) => r.json()).catch(() => ({ success: false }));
    setClearing(false);
    setConfirmClear(false);
    if (res.success) { notify(true, "Matching activity logs cleared."); router.refresh(); }
    else notify(false, res.message ?? "Couldn't clear logs. Please try again.");
  }

  const filtersActive = filters.action !== "all" || filters.user !== "all" || filters.severity !== "all" || !!filters.search || !!filters.dateFrom || !!filters.dateTo;

  return (
    <div className={cn("mt-5 flex gap-5", !loaded && "invisible")}>
      <div className="min-w-0 flex-1 space-y-5">
        {show("al2-cards") && (
          <div className="grid grid-cols-2 gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
            {show("al2-k-total") && <StatCard icon={Activity} tint="bg-violet-50 text-violet-600" value={stats.total} label="Total Events" sub="All time" />}
            {show("al2-k-today") && <StatCard icon={CalendarClock} tint="bg-blue-50 text-blue-600" value={stats.today} label="Today" sub="Since 12:00 AM" />}
            {show("al2-k-security") && <StatCard icon={ShieldAlert} tint="bg-amber-50 text-amber-600" value={stats.security} label="Security Events" sub="Login & account changes" />}
            {show("al2-k-failed") && <StatCard icon={TriangleAlert} tint="bg-red-50 text-red-500" value={stats.failed} label="Failed Actions" sub="Last 24 hours" />}
          </div>
        )}

        <section className={cn(CARD, "p-4 sm:p-5")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect label="Action" value={filters.action} onChange={(v) => setParam({ action: v })}>
              <option value="all">All Actions</option>
              {actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
            </FilterSelect>
            <FilterSelect label="User" value={filters.user} onChange={(v) => setParam({ user: v })}>
              <option value="all">All Users</option>
              {users.map((u) => <option key={u.username} value={u.username}>{u.username}</option>)}
            </FilterSelect>
            <FilterSelect label="Severity" value={filters.severity} onChange={(v) => setParam({ severity: v })}>
              <option value="all">All Severities</option>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </FilterSelect>
            <div className="flex gap-2">
              <input type="date" value={filters.dateFrom} onChange={(e) => setParam({ dateFrom: e.target.value })} className={inputCls} aria-label="From date" />
              <input type="date" value={filters.dateTo} onChange={(e) => setParam({ dateTo: e.target.value })} className={inputCls} aria-label="To date" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search IP address or description…" className={cn(inputCls, "pl-9")} />
            </div>
            {filtersActive && (
              <button type="button" onClick={() => { setSearch(""); router.push("?"); }} className="flex items-center gap-1 text-sm font-medium text-[#2563eb] hover:underline">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
            <button type="button" onClick={exportCsv} className="ml-auto flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#dee2e6] bg-white px-3.5 text-sm font-medium text-[#374151] hover:bg-[#f9fafb]">
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button type="button" onClick={() => setConfirmClear(true)} className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-red-200 bg-white px-3.5 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" /> Clear Logs
            </button>
          </div>
        </section>

        <LogsTable logs={logs} show={show} selectedId={selected?.id ?? null} onSelect={setSelected} />

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-admin-gray-700">
          <span>{totalLogs === 0 ? "Showing 0 events" : `Showing ${(page - 1) * pageSize + 1} to ${Math.min(page * pageSize, totalLogs)} of ${totalLogs} events`}</span>
          {totalPages > 1 && <Pager page={page} pageCount={totalPages} onPage={goPage} />}
        </div>
      </div>

      {selected && <DetailPanel log={selected} onClose={() => setSelected(null)} />}

      {confirmClear && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmClear(false)}>
          <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h5 className="mb-2 flex items-center gap-2 text-lg font-bold text-admin-gray-900"><Trash2 className="h-5 w-5 text-red-500" /> Clear matching logs?</h5>
            <p className="text-sm text-admin-gray-600">This deletes every log entry matching the currently applied filters. This can&apos;t be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmClear(false)} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
              <button type="button" disabled={clearing} onClick={clearLogs} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {clearing && <Loader2 className="h-4 w-4 animate-spin" />} Clear Logs
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-[0.5rem] border px-4 py-3 text-sm shadow-lg", toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, tint, value, label, sub }: { icon: React.ComponentType<{ className?: string }>; tint: string; value: number; label: string; sub: string }) {
  return (
    <div className={cn(CARD, "flex items-center gap-4 px-5 py-4")}>
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tint)}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0">
        <span className="block text-xs text-admin-gray-500">{label}</span>
        <span className="block text-2xl font-bold leading-tight text-admin-gray-900">{value.toLocaleString("en-IN")}</span>
        <span className="block text-xs text-admin-gray-400">{sub}</span>
      </span>
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-admin-gray-500">{label}</span>
      <span className="relative block">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "cursor-pointer appearance-none pr-8")}>{children}</select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
      </span>
    </label>
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
    <nav className="flex" aria-label="Log pages">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={cn(btn, "text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300")}><ChevronLeft className="h-4 w-4" /></button>
      {nums.map((n, i) => n === "…" ? <span key={`e${i}`} className={cn(btn, "text-admin-gray-400")}>…</span> :
        <button key={n} type="button" onClick={() => onPage(n)} className={cn(btn, n === page ? "relative z-10 border-[#2563eb] bg-[#2563eb] text-white" : "text-[#2563eb] hover:bg-admin-gray-50")}>{n}</button>)}
      <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)} className={cn(btn, "text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300")}><ChevronRight className="h-4 w-4" /></button>
    </nav>
  );
}

/* ───────────────────────── table ───────────────────────── */

function Avatar({ username }: { username: string | null }) {
  const initial = (username || "?").slice(0, 1).toUpperCase();
  const hue = username ? (username.charCodeAt(0) * 47) % 360 : 220;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: `hsl(${hue} 55% 48%)` }}>
      {initial}
    </span>
  );
}

const ACTION_COLOR = (actionType: string) => {
  if (actionType.includes("delete")) return "bg-red-50 text-red-700";
  if (actionType.startsWith("login")) return actionType === "login_success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  if (actionType.includes("create")) return "bg-emerald-50 text-emerald-700";
  if (actionType.includes("update") || actionType.includes("edit")) return "bg-blue-50 text-blue-700";
  return "bg-admin-gray-100 text-admin-gray-600";
};

function LogsTable({ logs, show, selectedId, onSelect }: { logs: LogRow2[]; show: (k: string) => boolean; selectedId: number | null; onSelect: (l: LogRow2) => void }) {
  const td = "border-b border-admin-gray-100 px-3 py-3 align-middle";
  return (
    <section className={cn(CARD, "overflow-hidden")}>
      {logs.length === 0 ? (
        <p className="py-14 text-center text-sm text-admin-gray-400">No activity logs match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-admin-gray-200 bg-[#f8f9fa] text-left text-xs font-bold uppercase text-admin-gray-500">
                <th className="px-3 py-3">ID</th>
                {show("al2-c-user") && <th className="px-3 py-3">User</th>}
                {show("al2-c-action") && <th className="px-3 py-3">Action</th>}
                {show("al2-c-description") && <th className="px-3 py-3">Description</th>}
                {show("al2-c-tech") && <th className="px-3 py-3">Tech Info</th>}
                {show("al2-c-severity") && <th className="px-3 py-3">Severity</th>}
                {show("al2-c-date") && <th className="px-3 py-3">Date</th>}
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const sev = classifySeverity(l.actionType);
                const ua = parseUserAgent(l.userAgent);
                const active = selectedId === l.id;
                return (
                  <tr key={l.id} onClick={() => onSelect(l)} role="button" tabIndex={0}
                    className={cn("cursor-pointer transition-colors", active ? "bg-blue-50/70" : "hover:bg-admin-gray-50")}>
                    <td className={cn(td, "font-mono text-xs text-admin-gray-500")}>#AL-{l.id}</td>
                    {show("al2-c-user") && (
                      <td className={td}>
                        <div className="flex items-center gap-2.5">
                          <Avatar username={l.username} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-admin-gray-900">{l.username ?? "System"}</div>
                            {l.email && <div className="truncate text-xs text-admin-gray-400">{l.email}</div>}
                          </div>
                        </div>
                      </td>
                    )}
                    {show("al2-c-action") && <td className={td}><span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", ACTION_COLOR(l.actionType))}>{l.actionType}</span></td>}
                    {show("al2-c-description") && <td className={cn(td, "max-w-[260px] truncate text-admin-gray-700")} title={l.description}>{l.description}</td>}
                    {show("al2-c-tech") && (
                      <td className={cn(td, "text-xs text-admin-gray-500")}>
                        <div>{l.ipAddress ?? "—"}</div>
                        <div>{ua.browser} / {ua.os}</div>
                      </td>
                    )}
                    {show("al2-c-severity") && <td className={td}><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", SEVERITY_META[sev].cls)}>{SEVERITY_META[sev].label}</span></td>}
                    {show("al2-c-date") && <td className={cn(td, "whitespace-nowrap text-xs text-admin-gray-500")}>{new Date(l.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── detail side panel ───────────────────────── */

function DetailPanel({ log, onClose }: { log: LogRow2; onClose: () => void }) {
  const [tab, setTab] = useState<"details" | "raw">("details");
  const sev = classifySeverity(log.actionType);
  const ua = parseUserAgent(log.userAgent);
  const dt = new Date(log.createdAt);

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 border-b border-admin-gray-50 py-2.5 text-sm last:border-0">
      <span className="text-admin-gray-500">{label}</span>
      <span className="text-right font-medium text-admin-gray-900">{value}</span>
    </div>
  );

  return (
    <aside className={cn(CARD, "sticky top-4 h-fit w-[340px] shrink-0 p-5")}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold text-admin-gray-900">Event Details <span className="rounded-full bg-admin-gray-100 px-2 py-0.5 text-xs font-mono text-admin-gray-500">#AL-{log.id}</span></h3>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-admin-gray-500 hover:bg-admin-gray-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-4 flex gap-1 rounded-[0.5rem] border border-[#dee2e6] p-1">
        <button type="button" onClick={() => setTab("details")} className={cn("h-8 flex-1 rounded-[0.375rem] text-sm font-medium", tab === "details" ? "bg-[#2563eb] text-white" : "text-admin-gray-600 hover:bg-admin-gray-50")}>Details</button>
        <button type="button" onClick={() => setTab("raw")} className={cn("h-8 flex-1 rounded-[0.375rem] text-sm font-medium", tab === "raw" ? "bg-[#2563eb] text-white" : "text-admin-gray-600 hover:bg-admin-gray-50")}>Raw Data</button>
      </div>

      {tab === "details" ? (
        <>
          <Row label="Action" value={<span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold uppercase", ACTION_COLOR(log.actionType))}>{log.actionType}</span>} />
          <Row label="Severity" value={<span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", SEVERITY_META[sev].cls)}>{SEVERITY_META[sev].label}</span>} />
          <Row label="Date & Time" value={dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })} />
          <Row label="IP Address" value={log.ipAddress ?? "Not recorded"} />
          <Row label="Browser / OS" value={`${ua.browser} · ${ua.os}`} />

          <div className="mt-3 rounded-[0.5rem] bg-admin-gray-50 p-3">
            <div className="mb-1 text-xs font-semibold uppercase text-admin-gray-400">Description</div>
            <p className="text-sm text-admin-gray-800">{log.description}</p>
          </div>

          {log.username && (
            <div className="mt-3 flex items-center gap-3 rounded-[0.5rem] border border-admin-gray-100 p-3">
              <Avatar username={log.username} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold text-admin-gray-900">{log.username}</span>
                  {log.role && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">{log.role}</span>}
                </div>
                {log.email && <div className="truncate text-xs text-admin-gray-500">{log.email}</div>}
              </div>
              <Link href="/admin/user-manager" className="shrink-0 text-xs font-medium text-[#2563eb] hover:underline">View</Link>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-admin-gray-400">
            Geolocation, session ID and request ID aren&apos;t tracked by this system, so they&apos;re not shown here rather than guessed.
          </p>
        </>
      ) : (
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-[0.5rem] bg-admin-gray-900 p-3 text-[11px] leading-relaxed text-emerald-300">
          {JSON.stringify({ id: log.id, actionType: log.actionType, description: log.description, ipAddress: log.ipAddress, userAgent: log.userAgent, user: log.username, email: log.email, role: log.role, createdAt: log.createdAt }, null, 2)}
        </pre>
      )}
    </aside>
  );
}
