"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowDown, ArrowUp, BadgeCheck, CalendarDays, CheckCircle2, ChevronDown, ChevronsUpDown, Download, EyeOff,
  IndianRupee, Loader2, Mail, Phone, Plus, Search, ShoppingBag, Store, UserPlus, Users, Wallet, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { Customer2Row, Customers2Data } from "@/lib/customers2";
import { parseCustomerInput } from "@/lib/customer2-save";
import { Modal, Pager } from "@/components/admin/campaigns2/ui";
import { money } from "@/components/admin/campaigns2/format";

const PAGE_PATH = "/admin/ecommerce/customers2";
const EVT_EXPORT = "customers2:export";
const EVT_NEW = "customers2:new";
const PAISA = 0.004;

export function Customers2HeaderButtons() {
  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_EXPORT))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]">
        <Download className="h-4 w-4" /> Export
      </button>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_NEW))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-blue-600 px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
        <Plus className="h-4 w-4" /> Add Customer
      </button>
    </>
  );
}

/* ── dates ── */
const istTodayYmd = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
function shiftYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const longDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
const istYmdOf = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

type SortKey = "name" | "orders" | "spent" | "due" | "created" | "last";
interface Filters {
  type: "all" | "online" | "offline";
  status: "all" | "active" | "inactive";
  dues: "all" | "with" | "without";
  activity: "all" | "buyers" | "never";
  dateField: "none" | "created" | "lastOrder";
}
const NO_FILTERS: Filters = { type: "all", status: "all", dues: "all", activity: "all", dateField: "none" };

const ROW_H = 80;
const HEAD_H = 50;
const MIN_ROWS = 5;
const td = "border border-[#dee2e6] px-3 align-middle";

export function Customers2Body({ data, range, notice }: { data: Customers2Data; range: { from: string; to: string }; notice?: string | null }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [navigating, startNavigate] = useTransition();

  const [rows, setRows] = useState(data.rows);
  useEffect(() => setRows(data.rows), [data.rows]);

  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "created", dir: "desc" });
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [editor, setEditor] = useState<{ customer: Customer2Row | null } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(notice ? { ok: true, text: notice } : null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));
  const applyCard = (next: Partial<Filters>) => { setF({ ...NO_FILTERS, ...next }); setSearch(""); };
  const c = data.cards;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (f.type !== "all" && r.customerType !== f.type) return false;
      if (f.status === "active" && r.status !== "active") return false;
      if (f.status === "inactive" && r.status === "active") return false;
      if (f.dues === "with" && !(r.dueBalance > PAISA)) return false;
      if (f.dues === "without" && r.dueBalance > PAISA) return false;
      if (f.activity === "buyers" && !r.activeInRange) return false;
      if (f.activity === "never" && r.orders > 0) return false;
      if (f.dateField === "created") {
        const d = istYmdOf(r.createdAt);
        if (d < range.from || d > range.to) return false;
      } else if (f.dateField === "lastOrder") {
        if (!r.lastOrderAt) return false;
        const d = istYmdOf(r.lastOrderAt);
        if (d < range.from || d > range.to) return false;
      }
      if (term) {
        const hay = `${r.name} ${r.email ?? ""} ${r.phone ?? ""} ${r.address ?? ""} ${r.id}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const time = (v: string | null) => (v ? new Date(v).getTime() : 0);
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "name": return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * dir;
        case "orders": return (a.orders - b.orders) * dir;
        case "spent": return (a.spent - b.spent) * dir;
        case "due": return (a.dueBalance - b.dueBalance) * dir;
        case "last": return (time(a.lastOrderAt) - time(b.lastOrderAt)) * dir;
        default: return (time(a.createdAt) - time(b.createdAt)) * dir;
      }
    });
  }, [rows, f, q, sort, range]);

  useEffect(() => setPage(1), [f, q, sort, pageSize, range]);
  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  const start = pageSize === 0 ? 0 : (cur - 1) * pageSize;
  const pageRows = pageSize === 0 ? filtered : filtered.slice(start, start + pageSize);
  const filtersActive = JSON.stringify(f) !== JSON.stringify(NO_FILTERS) || search.trim() !== "";

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  }

  async function setStatus(r: Customer2Row, status: "active" | "inactive") {
    if (r.status === status) return;
    setBusy((s) => new Set(s).add(r.id));
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status } : x)));
    try {
      const res = await fetch(`/api/ecommerce/customers2/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || d.success !== true) {
        setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status: r.status } : x)));
        setToast({ ok: false, text: d.message || "Could not change the status. Please try again." });
        return;
      }
      setToast({ ok: true, text: `“${r.name}” is now ${status === "active" ? "active" : "inactive"}.` });
      router.refresh();
    } catch {
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status: r.status } : x)));
      setToast({ ok: false, text: "Could not reach the server. Please try again." });
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(r.id); return n; });
    }
  }

  function exportCsv() {
    if (filtered.length === 0) return setToast({ ok: false, text: "There are no customers to export." });
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["ID", "Name", "Phone", "Email", "Type", "Status", "Orders", "Total Spent", "Due Balance", "Last Order", "Joined", "Address"].join(",")];
    for (const r of filtered) {
      lines.push([r.id, r.name, r.phone, r.email, r.customerType === "offline" ? "Walk-in" : "Online", r.status,
        r.orders, r.spent.toFixed(2), r.dueBalance.toFixed(2), r.lastOrderAt ? fmtDate(r.lastOrderAt) : "", fmtDate(r.createdAt), r.address].map(cell).join(","));
    }
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const exportRef = useRef(exportCsv);
  exportRef.current = exportCsv;
  useEffect(() => {
    const onExport = () => exportRef.current();
    const onNew = () => setEditor({ customer: null });
    window.addEventListener(EVT_EXPORT, onExport);
    window.addEventListener(EVT_NEW, onNew);
    return () => {
      window.removeEventListener(EVT_EXPORT, onExport);
      window.removeEventListener(EVT_NEW, onNew);
    };
  }, []);

  const navigate = (url: string) => startNavigate(() => router.push(url, { scroll: false }));

  const cols = [
    { key: "cus2-c-customer", w: "" },
    { key: "cus2-c-contact", w: "w-[220px]" },
    { key: "cus2-c-type", w: "w-[120px]" },
    { key: "cus2-c-orders", w: "w-[110px]" },
    { key: "cus2-c-spent", w: "w-[140px]" },
    { key: "cus2-c-due", w: "w-[130px]" },
    { key: "cus2-c-status", w: "w-[130px]" },
    { key: "cus2-c-actions", w: "w-[150px]" },
  ].filter((x) => show("cus2-table") && show(x.key));

  return (
    <div className={cn("space-y-5", !loaded && "invisible")} aria-busy={navigating}>
      {show("cus2-range") && <RangeBar range={range} navigate={navigate} pending={navigating} />}

      {show("cus2-cards") && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {show("cus2-k-total") && <Card icon={Users} tint="bg-blue-50 text-blue-600" value={String(c.total)} label="All Customers" sub={`${c.active} active · ${c.inactive} inactive`} on={!filtersActive} onClick={() => applyCard({})} />}
          {show("cus2-k-online") && <Card icon={ShoppingBag} tint="bg-violet-50 text-violet-600" value={String(c.online)} label="Online Customers" sub="signed up on the shop" on={f.type === "online"} onClick={() => applyCard({ type: "online" })} />}
          {show("cus2-k-offline") && <Card icon={Store} tint="bg-amber-50 text-amber-600" value={String(c.offline)} label="Walk-in Customers" sub="added at the counter" on={f.type === "offline"} onClick={() => applyCard({ type: "offline" })} />}
          {show("cus2-k-dues") && <Card icon={Wallet} tint="bg-red-50 text-red-600" value={String(c.withDues)} label="With Dues" sub={`${money(c.duesAmount)} outstanding`} on={f.dues === "with"} onClick={() => applyCard({ dues: "with" })} />}
          {show("cus2-k-new") && <Card icon={UserPlus} tint="bg-emerald-50 text-emerald-600" value={String(c.newInRange)} label="New in Range" sub="joined in this period" on={f.dateField === "created"} onClick={() => applyCard({ dateField: "created" })} />}
          {show("cus2-k-buyers") && <Card icon={CalendarDays} tint="bg-sky-50 text-sky-600" value={String(c.buyersInRange)} label="Bought in Range" sub="customers who ordered" on={f.activity === "buyers"} onClick={() => applyCard({ activity: "buyers" })} />}
          {show("cus2-k-spent") && <Card icon={IndianRupee} tint="bg-emerald-50 text-emerald-600" value={money(c.spentInRange)} label="Sales in Range" sub="from these customers" on={false} onClick={() => applyCard({ activity: "buyers" })} />}
          {show("cus2-k-inactive") && <Card icon={EyeOff} tint="bg-slate-100 text-slate-600" value={String(c.inactive)} label="Inactive" sub="cannot sign in" on={f.status === "inactive"} onClick={() => applyCard({ status: "inactive" })} />}
        </div>
      )}

      {show("cus2-filters") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {show("cus2-f-type") && (
              <Select icon={Users} label="Customer Type" value={f.type} onChange={(v) => set("type", v as Filters["type"])} on={f.type !== "all"}>
                <option value="all">All customers</option>
                <option value="online">Online</option>
                <option value="offline">Walk-in</option>
              </Select>
            )}
            {show("cus2-f-status") && (
              <Select icon={BadgeCheck} label="Status" value={f.status} onChange={(v) => set("status", v as Filters["status"])} on={f.status !== "all"}>
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            )}
            {show("cus2-f-dues") && (
              <Select icon={Wallet} label="Dues" value={f.dues} onChange={(v) => set("dues", v as Filters["dues"])} on={f.dues !== "all"}>
                <option value="all">All</option>
                <option value="with">Has a due</option>
                <option value="without">No due</option>
              </Select>
            )}
            {show("cus2-f-activity") && (
              <Select icon={ShoppingBag} label="Buying" value={f.activity} onChange={(v) => set("activity", v as Filters["activity"])} on={f.activity !== "all"}>
                <option value="all">All</option>
                <option value="buyers">Bought in range</option>
                <option value="never">Never ordered</option>
              </Select>
            )}
            {show("cus2-f-datefield") && (
              <Select icon={CalendarDays} label="Date range applies to" value={f.dateField} onChange={(v) => set("dateField", v as Filters["dateField"])} on={f.dateField !== "none"}>
                <option value="none">Ignore date range</option>
                <option value="created">Joined date</option>
                <option value="lastOrder">Last order date</option>
              </Select>
            )}
          </div>
        </section>
      )}

      {show("cus2-table") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-[15px] text-admin-gray-900">
            <label className="flex items-center gap-2">
              Show
              <span className="relative">
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Entries per page"
                  className="h-10 w-[90px] appearance-none rounded-[0.375rem] border border-[#dee2e6] bg-white pl-3 pr-8 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15">
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value={0}>All</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-600" />
              </span>
              entries
            </label>
            {filtersActive && (
              <button type="button" onClick={() => { setF(NO_FILTERS); setSearch(""); }} className="flex items-center gap-1 text-[13px] font-medium text-[#2563eb] hover:underline">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
            {show("cus2-t-search") && (
              <label className="ml-auto flex items-center gap-2">
                Search:
                <span className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" placeholder="Name, phone, email…"
                    className="h-10 w-[260px] rounded-[0.375rem] border border-[#dee2e6] pl-8 pr-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
                </span>
              </label>
            )}
          </div>

          <div className="overflow-x-auto" style={{ minHeight: pageSize === 0 ? undefined : HEAD_H + Math.min(pageSize, MIN_ROWS) * ROW_H }}>
            <table className="w-full min-w-[1060px] table-fixed border-collapse text-[15px]">
              <colgroup>{cols.map((x) => <col key={x.key} className={x.w} />)}</colgroup>
              <thead>
                <tr className="bg-[#f8f9fa] text-left font-bold text-admin-gray-900" style={{ height: HEAD_H }}>
                  {show("cus2-c-customer") && <SortTh label="Customer" active={sort.key === "name" ? sort.dir : null} onClick={() => toggleSort("name")} />}
                  {show("cus2-c-contact") && <th className={td}>Contact</th>}
                  {show("cus2-c-type") && <th className={td}>Type</th>}
                  {show("cus2-c-orders") && <SortTh label="Orders" active={sort.key === "orders" ? sort.dir : null} onClick={() => toggleSort("orders")} />}
                  {show("cus2-c-spent") && <SortTh label="Total Spent" active={sort.key === "spent" ? sort.dir : null} onClick={() => toggleSort("spent")} />}
                  {show("cus2-c-due") && <SortTh label="Due" active={sort.key === "due" ? sort.dir : null} onClick={() => toggleSort("due")} />}
                  {show("cus2-c-status") && <th className={td}>Status</th>}
                  {show("cus2-c-actions") && <th className={td}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={cols.length || 1} className={cn(td, "py-12 text-center text-admin-gray-500")}>
                      {rows.length === 0 ? (
                        <span className="inline-flex flex-col items-center gap-3">
                          <span>No customers yet.</span>
                          <button type="button" onClick={() => setEditor({ customer: null })} className="flex h-10 items-center gap-2 rounded-[0.5rem] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Add Customer</button>
                        </span>
                      ) : "No customers match these filters."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => {
                    const isBusy = busy.has(r.id);
                    return (
                      <tr key={r.id} style={{ height: ROW_H }} className={cn("odd:bg-[#f2f2f2] even:bg-white", isBusy && "opacity-60")}>
                        {show("cus2-c-customer") && (
                          <td className={td}>
                            <Link href={`/admin/ecommerce/customers/${r.id}`} title={`Open ${r.name}'s profile`} className="block max-w-full truncate font-medium text-admin-gray-900 hover:text-[#2563eb] hover:underline">{r.name}</Link>
                            <div className="truncate text-xs text-admin-gray-500">
                              Joined {fmtDate(r.createdAt)}{r.lastOrderAt ? ` · last order ${fmtDate(r.lastOrderAt)}` : " · never ordered"}
                            </div>
                          </td>
                        )}
                        {show("cus2-c-contact") && (
                          <td className={td}>
                            {r.phone ? <a href={`tel:${r.phone}`} className="flex items-center gap-1.5 truncate text-admin-gray-800 hover:underline"><Phone className="h-3.5 w-3.5 shrink-0 text-admin-gray-400" />{r.phone}</a> : <span className="text-admin-gray-400">No phone</span>}
                            {r.email ? <a href={`mailto:${r.email}`} title={r.email} className="flex items-center gap-1.5 truncate text-xs text-admin-gray-500 hover:underline"><Mail className="h-3 w-3 shrink-0" />{r.email}</a> : <span className="block text-xs text-admin-gray-400">No email</span>}
                          </td>
                        )}
                        {show("cus2-c-type") && (
                          <td className={td}>
                            <span className={cn("inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold", r.customerType === "offline" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-700")}>
                              {r.customerType === "offline" ? "Walk-in" : "Online"}
                            </span>
                          </td>
                        )}
                        {show("cus2-c-orders") && <td className={cn(td, "font-medium text-admin-gray-900")}>{r.orders}</td>}
                        {show("cus2-c-spent") && <td className={cn(td, "whitespace-nowrap font-semibold text-admin-gray-900")}>{money(r.spent)}</td>}
                        {show("cus2-c-due") && (
                          <td className={cn(td, "whitespace-nowrap")}>
                            {r.dueBalance > PAISA
                              ? <Link href={`/admin/ecommerce/due2?from=${range.from}&to=${range.to}`} className="font-bold text-[#dc3545] hover:underline">{money(r.dueBalance)}</Link>
                              : <span className="text-admin-gray-400">—</span>}
                          </td>
                        )}
                        {show("cus2-c-status") && (
                          <td className={td}>
                            <button type="button" disabled={isBusy} onClick={() => setStatus(r, r.status === "active" ? "inactive" : "active")}
                              aria-label={`${r.name} is ${r.status === "active" ? "active" : "inactive"} — click to change`} title="Click to change"
                              className={cn("inline-flex h-9 items-center gap-2 rounded-[0.25rem] px-3.5 text-[14px] font-semibold text-white disabled:cursor-wait", r.status === "active" ? "bg-[#5cc28a] hover:bg-[#4bb279]" : "bg-[#8a8f98] hover:bg-[#777c85]")}>
                              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : r.status === "active" ? "Active" : "Inactive"}
                            </button>
                          </td>
                        )}
                        {show("cus2-c-actions") && (
                          <td className={td}>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setEditor({ customer: r })} title={`Edit ${r.name}`}
                                className="flex h-9 items-center rounded-[0.375rem] bg-[#4361ee] px-3 text-[13px] font-semibold text-white hover:bg-[#3651d4]">Edit</button>
                              <Link href={`/admin/ecommerce/customers/${r.id}`} title={`Open ${r.name}'s profile`}
                                className="flex h-9 items-center rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 text-[13px] font-medium text-admin-gray-700 hover:bg-admin-gray-50">Profile</Link>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-3 text-[15px] text-admin-gray-800">
            <span>
              {filtered.length === 0 ? "Showing 0 entries" : `Showing ${start + 1} to ${start + pageRows.length} of ${filtered.length} entries`}
              {filtered.length !== rows.length && <span className="text-admin-gray-500"> (filtered from {rows.length} total entries)</span>}
            </span>
            {pageCount > 1 && <Pager page={cur} pageCount={pageCount} onPage={setPage} label="Customer pages" />}
          </div>
        </section>
      )}

      {editor && (
        <CustomerEditor
          key={editor.customer?.id ?? "new"}
          customer={editor.customer}
          onClose={() => setEditor(null)}
          onSaved={(msg) => { setEditor(null); setToast({ ok: true, text: msg }); router.refresh(); }}
        />
      )}

      {toast && createPortal(
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-[0.5rem] border px-4 py-3 text-sm shadow-lg", toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ───────────────────────── editor ───────────────────────── */

const inputCls = "h-10 w-full rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 text-sm outline-none focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15";
const labelCls = "mb-1.5 block text-[13px] font-semibold text-admin-gray-800";

function CustomerEditor({ customer, onClose, onSaved }: { customer: Customer2Row | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [type, setType] = useState<"online" | "offline">((customer?.customerType as "online" | "offline") ?? "offline");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [active, setActive] = useState(customer ? customer.status === "active" : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name, phone, email, customerType: type, address, status: active ? "active" : "inactive" };
    // The same rules the server applies, so most mistakes are caught before sending.
    const check = parseCustomerInput(payload);
    if (!check.ok) return setError(check.message);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(customer ? `/api/ecommerce/customers2/${customer.id}` : "/api/ecommerce/customers2", {
        method: customer ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || d.success !== true) {
        setError(d.message || "Could not save the customer. Please try again.");
        return;
      }
      onSaved(customer ? `“${name.trim()}” saved.` : `Customer “${name.trim()}” added.`);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={customer ? `Edit ${customer.name}` : "Add Customer"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-4 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
          <button type="submit" form="customer-form" disabled={saving} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {customer ? "Save" : "Add Customer"}
          </button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="cf2-name" className={labelCls}>Name</label>
          <input id="cf2-name" autoFocus value={name} maxLength={150} onChange={(e) => { setName(e.target.value); setError(null); }} className={inputCls} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cf2-phone" className={labelCls}>Phone</label>
            <input id="cf2-phone" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }} className={inputCls} />
          </div>
          <div>
            <label htmlFor="cf2-email" className={labelCls}>Email {type === "offline" && <span className="font-normal text-admin-gray-500">(optional)</span>}</label>
            <input id="cf2-email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} className={inputCls} />
          </div>
        </div>
        <div>
          <span className={labelCls}>Customer type</span>
          <div className="inline-flex gap-1 rounded-[0.5rem] border border-admin-gray-200 bg-admin-gray-50 p-1" role="radiogroup" aria-label="Customer type">
            {([["offline", "Walk-in"], ["online", "Online"]] as const).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => { setType(k); setError(null); }}
                className={cn("rounded-[0.375rem] px-4 py-1.5 text-sm font-medium transition-colors", type === k ? "bg-white text-[#2563eb] shadow-sm" : "text-admin-gray-600 hover:text-admin-gray-900")}>
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-admin-gray-500">
            {type === "offline" ? "A walk-in customer is billed at the counter; a phone number is enough." : "An online customer signs in on the shop, so an email is needed."}
          </p>
        </div>
        <div>
          <label htmlFor="cf2-address" className={labelCls}>Address <span className="font-normal text-admin-gray-500">(optional)</span></label>
          <textarea id="cf2-address" rows={2} value={address} onChange={(e) => { setAddress(e.target.value); setError(null); }}
            className="w-full rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 py-2 text-sm outline-none focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15" />
        </div>
        <label className="flex items-center gap-2 text-sm text-admin-gray-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#2563eb]" />
          Active
        </label>
        {error && <p role="alert" className="rounded-[0.375rem] bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}

/* ───────────────────────── small pieces ───────────────────────── */

function SortTh({ label, active, onClick }: { label: string; active: "asc" | "desc" | null; onClick: () => void }) {
  return (
    <th className={cn(td, "font-bold text-admin-gray-900")} aria-sort={active ? (active === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-2 font-bold">
        {label}
        {active === "asc" ? <ArrowUp className="h-4 w-4 text-admin-gray-600" /> : active === "desc" ? <ArrowDown className="h-4 w-4 text-admin-gray-600" /> : <ChevronsUpDown className="h-4 w-4 text-admin-gray-300" />}
      </button>
    </th>
  );
}

function Card({ icon: Icon, tint, value, label, sub, on, onClick }: {
  icon: React.ComponentType<{ className?: string }>; tint: string; value: string; label: string; sub: string; on: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={`Show ${label.toLowerCase()}`}
      className={cn("flex items-center gap-3.5 rounded-xl border bg-white px-4 py-4 text-left shadow-sm transition-colors", on ? "border-[#2563eb]/40 ring-1 ring-[#2563eb]/25" : "border-admin-gray-200 hover:border-[#2563eb]/30")}>
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", tint)}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0">
        <span className="block truncate text-xl font-bold leading-tight text-admin-gray-900" title={value}>{value}</span>
        <span className="block truncate text-sm text-admin-gray-700">{label}</span>
        <span className="block truncate text-xs text-admin-gray-500">{sub}</span>
      </span>
    </button>
  );
}

function Select({ icon: Icon, label, value, onChange, on, children }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; onChange: (v: string) => void; on: boolean; children: React.ReactNode;
}) {
  return (
    <label className={cn("relative flex h-12 min-w-[190px] flex-1 cursor-pointer items-center gap-2.5 rounded-[0.5rem] border pl-3 pr-9 transition-colors focus-within:ring-2 focus-within:ring-[#2563eb]/15",
      on ? "border-[#2563eb]/40 bg-blue-50/50" : "border-admin-gray-200 bg-white hover:border-admin-gray-300")}>
      <Icon className={cn("h-4 w-4 shrink-0", on ? "text-[#2563eb]" : "text-admin-gray-500")} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs leading-4 text-admin-gray-500">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
          className="w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent text-sm font-medium leading-5 text-admin-gray-900 focus:outline-none">
          {children}
        </select>
      </span>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-500" />
    </label>
  );
}

function RangeBar({ range, navigate, pending }: { range: { from: string; to: string }; navigate: (url: string) => void; pending: boolean }) {
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  useEffect(() => { setFrom(range.from); setTo(range.to); }, [range]);

  const today = istTodayYmd();
  const firstThis = `${today.slice(0, 8)}01`;
  const lastPrev = shiftYmd(firstThis, -1);
  const presets: { key: string; label: string; range: [string, string] }[] = [
    { key: "today", label: "Today", range: [today, today] },
    { key: "7days", label: "7 Days", range: [shiftYmd(today, -6), today] },
    { key: "this_month", label: "This Month", range: [firstThis, today] },
    { key: "prev_month", label: "Previous Month", range: [`${lastPrev.slice(0, 8)}01`, lastPrev] },
    { key: "year", label: "This Year", range: [`${today.slice(0, 4)}-01-01`, today] },
  ];
  const active = presets.find((p) => p.range[0] === range.from && p.range[1] === range.to);
  const showing = active ? active.label : range.from === range.to ? longDate(range.from) : `${longDate(range.from)} – ${longDate(range.to)}`;
  const go = (a: string, b: string) => navigate(`${PAGE_PATH}?from=${a}&to=${b}`);
  const canApply = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && !(from === range.from && to === range.to);

  return (
    <section className="rounded-xl border border-admin-gray-200 bg-white px-5 py-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="text-sm text-admin-gray-700">Showing: <b className="text-admin-gray-900">{showing}</b></div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button key={p.key} type="button" disabled={pending} onClick={() => go(p.range[0], p.range[1])} aria-pressed={active?.key === p.key}
              className={cn("h-9 rounded-[0.375rem] px-3 text-sm font-medium transition-colors", active?.key === p.key ? "bg-[#2563eb] text-white" : "border border-admin-gray-200 bg-white text-admin-gray-700 hover:bg-admin-gray-50")}>
              {p.label}
            </button>
          ))}
        </div>
        <form className="ml-auto flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (canApply) go(from, to); }}>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="h-9 rounded-[0.375rem] border border-[#dee2e6] px-2.5 text-sm focus:border-[#86b7fe] focus:outline-none" />
          <span className="text-sm text-admin-gray-500">to</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="h-9 rounded-[0.375rem] border border-[#dee2e6] px-2.5 text-sm focus:border-[#86b7fe] focus:outline-none" />
          <button type="submit" disabled={!canApply || pending} className="flex h-9 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Apply
          </button>
        </form>
      </div>
    </section>
  );
}
