"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle, AlertTriangle, ArrowDown, ArrowRight, ArrowUp, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, ChevronsUpDown,
  Clock, Download, HandCoins, IndianRupee, Loader2, Package, Receipt, Search, Users, Wallet, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { Due2Data, Due2Row } from "@/lib/due2";
import { Modal, Pager } from "@/components/admin/campaigns2/ui";
import { money } from "@/components/admin/campaigns2/format";

const PAGE_PATH = "/admin/ecommerce/due2";
const EVT_EXPORT = "due2:export";
const PAISA = 0.004;

/* ───────────────────────── header button ───────────────────────── */

export function Due2HeaderButtons() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_EXPORT))}
      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]">
      <Download className="h-4 w-4" /> Export
    </button>
  );
}

/* ───────────────────────── dates ───────────────────────── */

const istTodayYmd = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
function shiftYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const dmy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const longDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
function fmtDateTime(iso: string) {
  const p = Object.fromEntries(dtFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
}
const istYmdOf = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

/* ───────────────────────── filters ───────────────────────── */

type SortKey = "promise" | "balance" | "customer" | "created";
interface Filters {
  status: "unpaid" | "all" | "paid" | "partial";
  promise: "all" | "overdue" | "today" | "upcoming" | "none";
  source: "all" | "offline" | "online";
  product: string; // "all" | product id
  dateField: "none" | "created" | "promised" | "paid";
}
const NO_FILTERS: Filters = { status: "unpaid", promise: "all", source: "all", product: "all", dateField: "none" };

const ROW_H = 84;
const HEAD_H = 50;
const MIN_ROWS = 5;
const td = "border border-[#dee2e6] px-3 align-middle";

interface Props {
  data: Due2Data;
  filters: { from: string; to: string };
  notice?: string | null;
  canEdit: boolean;
}

export function Due2Body({ data, filters: range, notice, canEdit }: Props) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [navigating, startNavigate] = useTransition();

  const [rows, setRows] = useState(data.rows);
  useEffect(() => setRows(data.rows), [data.rows]);

  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "promise", dir: "asc" });
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [collect, setCollect] = useState<Due2Row[] | null>(null);
  const [dateEdit, setDateEdit] = useState<Due2Row | null>(null);
  const [history, setHistory] = useState<Due2Row | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(notice ? { ok: true, text: notice } : null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));
  const c = data.cards;

  /** The rows a card stands for, so clicking a card shows exactly that. */
  const applyCard = (next: Partial<Filters>) => {
    setF({ ...NO_FILTERS, ...next });
    setSearch("");
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      const unpaid = r.balance > PAISA;
      if (f.status === "unpaid" && !unpaid) return false;
      if (f.status === "paid" && unpaid) return false;
      if (f.status === "partial" && !(unpaid && r.amountPaid > PAISA)) return false;

      if (f.promise === "overdue" && !(unpaid && r.overdueDays > 0)) return false;
      if (f.promise === "today" && r.promisedDate !== data.today) return false;
      if (f.promise === "upcoming" && !(r.promisedDate !== null && r.promisedDate > data.today)) return false;
      if (f.promise === "none" && r.promisedDate !== null) return false;

      if (f.source !== "all" && r.orderType !== f.source) return false;
      if (f.product !== "all" && !r.productIds.includes(Number(f.product))) return false;

      if (f.dateField !== "none") {
        if (f.dateField === "created") {
          const d = istYmdOf(r.createdAt);
          if (d < range.from || d > range.to) return false;
        } else if (f.dateField === "promised") {
          if (!r.promisedDate || r.promisedDate < range.from || r.promisedDate > range.to) return false;
        } else {
          // "paid": was any payment collected inside the range?
          if (!r.payments.some((p) => { const d = istYmdOf(p.createdAt); return d >= range.from && d <= range.to; })) return false;
        }
      }

      if (term) {
        const hay = `${r.customerName} ${r.customerPhone ?? ""} ${r.orderNumber ?? ""} ${r.orderId} ${r.id} ${r.productNames.join(" ")} ${r.payments.map((p) => p.receiptNumber).join(" ")}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    // Sorting. The default puts the nearest promise first (the one to chase
    // today), with dues that have no date at the end whichever way you sort,
    // because they aren't part of the promise order.
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === "promise") {
        if (a.promisedDate === null || b.promisedDate === null) {
          if (a.promisedDate === b.promisedDate) return b.balance - a.balance;
          return a.promisedDate === null ? 1 : -1;
        }
        if (a.promisedDate !== b.promisedDate) return (a.promisedDate < b.promisedDate ? -1 : 1) * dir;
        return b.balance - a.balance;
      }
      if (sort.key === "balance") return (a.balance - b.balance) * dir;
      if (sort.key === "customer") return a.customerName.toLowerCase().localeCompare(b.customerName.toLowerCase()) * dir;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    });
  }, [rows, f, q, sort, range, data.today]);

  useEffect(() => setPage(1), [f, q, sort, pageSize, range]);
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(filtered.map((r) => r.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  const start = pageSize === 0 ? 0 : (cur - 1) * pageSize;
  const pageRows = pageSize === 0 ? filtered : filtered.slice(start, start + pageSize);
  const filtersActive = JSON.stringify(f) !== JSON.stringify(NO_FILTERS) || search.trim() !== "";
  const pageAllOn = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const selectedRows = filtered.filter((r) => selected.has(r.id) && r.balance > PAISA);
  const shownTotal = useMemo(() => Math.round(filtered.reduce((s, r) => s + r.balance, 0) * 100) / 100, [filtered]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "customer" || key === "promise" ? "asc" : "desc" }));
  }

  function exportCsv() {
    if (filtered.length === 0) return setToast({ ok: false, text: "There are no dues to export." });
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["Due ID", "Customer", "Phone", "Order", "Source", "Amount", "Paid", "Balance", "Promise Date", "Overdue Days", "Status", "Created", "Products", "Receipts"].join(",")];
    for (const r of filtered) {
      lines.push([
        r.id, r.customerName, r.customerPhone, r.orderNumber ?? r.orderId, r.orderType === "offline" ? "In-store" : "Online",
        r.amount.toFixed(2), r.amountPaid.toFixed(2), r.balance.toFixed(2), r.promisedDate ?? "", r.overdueDays || "",
        r.balance > PAISA ? (r.amountPaid > PAISA ? "Partly paid" : "Unpaid") : "Paid",
        fmtDateTime(r.createdAt), r.productNames.join(" | "), r.payments.map((p) => p.receiptNumber).join(" | "),
      ].map(cell).join(","));
    }
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `dues-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const exportRef = useRef(exportCsv);
  exportRef.current = exportCsv;
  useEffect(() => {
    const on = () => exportRef.current();
    window.addEventListener(EVT_EXPORT, on);
    return () => window.removeEventListener(EVT_EXPORT, on);
  }, []);

  const navigate = (url: string) => startNavigate(() => router.push(url, { scroll: false }));

  /** After money is taken or a date changes, update the row here and re-read the server. */
  const afterChange = useCallback((text: string) => {
    setToast({ ok: true, text });
    setSelected(new Set());
    router.refresh();
  }, [router]);

  const cols = [
    { key: "due2-c-select", w: "w-[44px]" },
    { key: "due2-c-customer", w: "" },
    { key: "due2-c-order", w: "w-[170px]" },
    { key: "due2-c-amount", w: "w-[150px]" },
    { key: "due2-c-balance", w: "w-[130px]" },
    { key: "due2-c-promise", w: "w-[190px]" },
    { key: "due2-c-status", w: "w-[120px]" },
    { key: "due2-c-actions", w: "w-[180px]" },
  ].filter((x) => show("due2-table") && show(x.key));

  return (
    <div className={cn("space-y-5", !loaded && "invisible")} aria-busy={navigating}>
      {show("due2-range") && <RangeBar range={range} navigate={navigate} pending={navigating} />}

      {show("due2-cards") && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {show("due2-k-total") && <Card icon={IndianRupee} tint="bg-red-50 text-red-600" value={money(c.totalDue)} label="Total Due" sub={`${c.dueCount} unpaid due${c.dueCount === 1 ? "" : "s"}`} on={f.status === "unpaid" && f.promise === "all" && f.product === "all" && f.source === "all" && f.dateField === "none"} onClick={() => applyCard({})} />}
          {show("due2-k-overdue") && <Card icon={AlertTriangle} tint="bg-orange-50 text-orange-600" value={money(c.overdueAmount)} label="Overdue" sub={`${c.overdueCount} past promise date`} on={f.promise === "overdue"} onClick={() => applyCard({ promise: "overdue" })} />}
          {show("due2-k-today") && <Card icon={CalendarClock} tint="bg-amber-50 text-amber-600" value={money(c.dueTodayAmount)} label="Due Today" sub={`${c.dueTodayCount} promised for today`} on={f.promise === "today"} onClick={() => applyCard({ promise: "today" })} />}
          {show("due2-k-people") && <Card icon={Users} tint="bg-sky-50 text-sky-600" value={String(c.totalDuePeople)} label="People with Dues" sub="customers who owe money" on={false} onClick={() => applyCard({})} />}
          {show("due2-k-newtoday") && <Card icon={Clock} tint="bg-violet-50 text-violet-600" value={money(c.todayNewDue)} label="Today's New Due" sub={`${c.todayNewCount} new today`} on={false} onClick={() => applyCard({ status: "all", dateField: "created" })} />}
          {show("due2-k-collected") && <Card icon={HandCoins} tint="bg-emerald-50 text-emerald-600" value={money(c.todayCollected)} label="Today's Collection" sub={`${c.todayCollectedCount} payment${c.todayCollectedCount === 1 ? "" : "s"} today`} on={false} onClick={() => applyCard({ status: "all", dateField: "paid" })} />}
          {show("due2-k-range") && <Card icon={Wallet} tint="bg-emerald-50 text-emerald-600" value={money(c.rangeCollected)} label="Collected in Range" sub={`${dmy(range.from)} – ${dmy(range.to)}`} on={f.dateField === "paid"} onClick={() => applyCard({ status: "all", dateField: "paid" })} />}
          {show("due2-k-nodate") && <Card icon={CalendarDays} tint="bg-slate-100 text-slate-600" value={money(c.noDateAmount)} label="No Promise Date" sub={`${c.noDateCount} need a date`} on={f.promise === "none"} onClick={() => applyCard({ promise: "none" })} />}
        </div>
      )}

      {show("due2-filters") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {show("due2-f-status") && (
              <Select icon={Receipt} label="Status" value={f.status} onChange={(v) => set("status", v as Filters["status"])} on={f.status !== "unpaid"}>
                <option value="unpaid">Unpaid only</option>
                <option value="partial">Partly paid</option>
                <option value="paid">Fully paid</option>
                <option value="all">All dues</option>
              </Select>
            )}
            {show("due2-f-promise") && (
              <Select icon={CalendarClock} label="Promise Date" value={f.promise} onChange={(v) => set("promise", v as Filters["promise"])} on={f.promise !== "all"}>
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due today</option>
                <option value="upcoming">Upcoming</option>
                <option value="none">No date set</option>
              </Select>
            )}
            {show("due2-f-source") && (
              <Select icon={Package} label="Order Source" value={f.source} onChange={(v) => set("source", v as Filters["source"])} on={f.source !== "all"}>
                <option value="all">All orders</option>
                <option value="offline">In-store (POS)</option>
                <option value="online">Online</option>
              </Select>
            )}
            {show("due2-f-product") && (
              <Select icon={Package} label="Product" value={f.product} onChange={(v) => set("product", v)} on={f.product !== "all"}>
                <option value="all">All products</option>
                {data.products.map((p) => <option key={p.id} value={String(p.id)}>{p.name} ({p.count})</option>)}
              </Select>
            )}
            {show("due2-f-datefield") && (
              <Select icon={CalendarDays} label="Date range applies to" value={f.dateField} onChange={(v) => set("dateField", v as Filters["dateField"])} on={f.dateField !== "none"}>
                <option value="none">Ignore date range</option>
                <option value="created">Due created</option>
                <option value="promised">Promise date</option>
                <option value="paid">Payment received</option>
              </Select>
            )}
          </div>
        </section>
      )}

      {show("due2-table") && (
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

            {show("due2-c-select") && canEdit && (
              <>
                <button type="button" disabled={selectedRows.length === 0} onClick={() => setCollect(selectedRows)}
                  className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#3d8b5f] px-3.5 text-sm font-semibold text-white hover:bg-[#33774f] disabled:cursor-not-allowed disabled:opacity-40">
                  <HandCoins className="h-4 w-4" /> Collect{selectedRows.length ? ` (${selectedRows.length})` : ""}
                </button>
                {selected.size > 0 && <button type="button" onClick={() => setSelected(new Set())} className="text-[13px] text-admin-gray-500 hover:underline">Clear selection</button>}
              </>
            )}

            {filtersActive && (
              <button type="button" onClick={() => { setF(NO_FILTERS); setSearch(""); }} className="flex items-center gap-1 text-[13px] font-medium text-[#2563eb] hover:underline">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}

            {show("due2-t-search") && (
              <label className="ml-auto flex items-center gap-2">
                Search:
                <span className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search dues" placeholder="Name, phone, order, product…"
                    className="h-10 w-[260px] rounded-[0.375rem] border border-[#dee2e6] pl-8 pr-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
                </span>
              </label>
            )}
          </div>

          <div className="overflow-x-auto" style={{ minHeight: pageSize === 0 ? undefined : HEAD_H + Math.min(pageSize, MIN_ROWS) * ROW_H }}>
            <table className="w-full min-w-[1020px] table-fixed border-collapse text-[15px]">
              <colgroup>{cols.map((x) => <col key={x.key} className={x.w} />)}</colgroup>
              <thead>
                <tr className="bg-[#f8f9fa] text-left font-bold text-admin-gray-900" style={{ height: HEAD_H }}>
                  {show("due2-c-select") && (
                    <th className={cn(td, "text-center")}>
                      <input type="checkbox" checked={pageAllOn} aria-label="Select dues on this page" className="h-4 w-4 accent-[#2563eb]"
                        onChange={(e) => setSelected((s) => { const n = new Set(s); pageRows.forEach((r) => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n; })} />
                    </th>
                  )}
                  {show("due2-c-customer") && <SortTh label="Customer" active={sort.key === "customer" ? sort.dir : null} onClick={() => toggleSort("customer")} />}
                  {show("due2-c-order") && <th className={td}>Order</th>}
                  {show("due2-c-amount") && <th className={td}>Amount / Paid</th>}
                  {show("due2-c-balance") && <SortTh label="Balance" active={sort.key === "balance" ? sort.dir : null} onClick={() => toggleSort("balance")} />}
                  {show("due2-c-promise") && <SortTh label="Promise Date" active={sort.key === "promise" ? sort.dir : null} onClick={() => toggleSort("promise")} />}
                  {show("due2-c-status") && <th className={td}>Status</th>}
                  {show("due2-c-actions") && <th className={td}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={cols.length || 1} className={cn(td, "py-12 text-center text-admin-gray-500")}>
                      {rows.length === 0 ? (
                        <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" /> No dues recorded yet.</span>
                      ) : "No dues match these filters."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => {
                    const unpaid = r.balance > PAISA;
                    return (
                      <tr key={r.id} style={{ height: ROW_H }} className={cn(selected.has(r.id) ? "bg-blue-50/60" : "odd:bg-[#f2f2f2] even:bg-white")}>
                        {show("due2-c-select") && (
                          <td className={cn(td, "text-center")}>
                            <input type="checkbox" checked={selected.has(r.id)} disabled={!unpaid} aria-label={`Select due of ${r.customerName}`} className="h-4 w-4 accent-[#2563eb] disabled:opacity-30"
                              onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                          </td>
                        )}
                        {show("due2-c-customer") && (
                          <td className={td}>
                            {r.customerId !== null ? (
                              <Link href={`/admin/ecommerce/customers/${r.customerId}`} title={`Open ${r.customerName}`} className="block max-w-full truncate font-medium text-admin-gray-900 hover:text-[#2563eb] hover:underline">{r.customerName}</Link>
                            ) : <span className="block max-w-full truncate font-medium text-admin-gray-900">{r.customerName}</span>}
                            <div className="truncate text-xs text-admin-gray-500">
                              {r.customerPhone ? <a href={`tel:${r.customerPhone}`} className="hover:underline">{r.customerPhone}</a> : "No phone"}
                              {r.productNames.length > 0 && <span title={r.productNames.join(", ")}> · {r.productNames.length} item{r.productNames.length === 1 ? "" : "s"}</span>}
                            </div>
                          </td>
                        )}
                        {show("due2-c-order") && (
                          <td className={td}>
                            <Link href={`/admin/ecommerce/orders/${r.orderId}`} className="block truncate text-[#2563eb] hover:underline">{r.orderNumber ?? `#${r.orderId}`}</Link>
                            <div className="truncate text-xs text-admin-gray-500">{r.orderType === "offline" ? "In-store" : "Online"} · {fmtDateTime(r.createdAt).split(",")[0]}</div>
                          </td>
                        )}
                        {show("due2-c-amount") && (
                          <td className={cn(td, "whitespace-nowrap")}>
                            <div>{money(r.amount)}</div>
                            <div className="text-xs text-emerald-600">Paid {money(r.amountPaid)}</div>
                          </td>
                        )}
                        {show("due2-c-balance") && (
                          <td className={cn(td, "whitespace-nowrap text-lg font-bold", unpaid ? "text-[#dc3545]" : "text-emerald-600")}>{money(r.balance)}</td>
                        )}
                        {show("due2-c-promise") && (
                          <td className={td}>
                            {canEdit ? (
                              <button type="button" onClick={() => setDateEdit(r)} title="Change promise date"
                                className="block max-w-full truncate text-left text-admin-gray-800 hover:text-[#2563eb] hover:underline">
                                {r.promisedDate ? longDate(r.promisedDate) : <span className="text-admin-gray-400">Set a date</span>}
                              </button>
                            ) : <span>{r.promisedDate ? longDate(r.promisedDate) : "—"}</span>}
                            {unpaid && r.overdueDays > 0 && <div className="text-xs font-semibold text-orange-600">{r.overdueDays} day{r.overdueDays === 1 ? "" : "s"} overdue</div>}
                            {unpaid && r.promisedDate === data.today && <div className="text-xs font-semibold text-amber-600">Due today</div>}
                          </td>
                        )}
                        {show("due2-c-status") && (
                          <td className={td}>
                            <span className={cn("inline-flex h-8 items-center rounded-[0.25rem] px-3 text-[14px] font-semibold text-white",
                              !unpaid ? "bg-[#5cc28a]" : r.overdueDays > 0 ? "bg-[#dc3545]" : r.amountPaid > PAISA ? "bg-[#e0a100]" : "bg-[#8a8f98]")}>
                              {!unpaid ? "Paid" : r.overdueDays > 0 ? "Overdue" : r.amountPaid > PAISA ? "Partly" : "Unpaid"}
                            </span>
                          </td>
                        )}
                        {show("due2-c-actions") && (
                          <td className={td}>
                            <div className="flex items-center gap-2">
                              {canEdit && unpaid && (
                                <button type="button" onClick={() => setCollect([r])} title={`Collect from ${r.customerName}`}
                                  className="flex h-9 items-center gap-1.5 rounded-[0.375rem] bg-[#3d8b5f] px-3 text-[13px] font-semibold text-white hover:bg-[#33774f]">
                                  <HandCoins className="h-4 w-4" /> Collect
                                </button>
                              )}
                              <button type="button" onClick={() => setHistory(r)} title="Payment history"
                                className="flex h-9 items-center gap-1.5 rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 text-[13px] font-medium text-admin-gray-700 hover:bg-admin-gray-50">
                                <Receipt className="h-4 w-4" /> {r.payments.length}
                              </button>
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
              {filtered.length > 0 && <span className="ml-2">· Balance shown: <b className="text-[#dc3545]">{money(shownTotal)}</b></span>}
            </span>
            {pageCount > 1 && <Pager page={cur} pageCount={pageCount} onPage={setPage} label="Due pages" />}
          </div>
        </section>
      )}

      {collect && <CollectDialog rows={collect} onClose={() => setCollect(null)} onDone={(msg) => { setCollect(null); afterChange(msg); }} />}
      {dateEdit && <PromiseDateDialog row={dateEdit} today={data.today} onClose={() => setDateEdit(null)} onDone={(msg) => { setDateEdit(null); afterChange(msg); }} />}
      {history && <HistoryDialog row={history} onClose={() => setHistory(null)} />}

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

/* ───────────────────────── dialogs ───────────────────────── */

const METHODS = ["Cash", "UPI", "Card", "Other"] as const;
const inputCls = "h-10 w-full rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 text-sm outline-none focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15";

/** Take money against one or several dues. Never lets you enter more than is owed. */
function CollectDialog({ rows, onClose, onDone }: { rows: Due2Row[]; onClose: () => void; onDone: (message: string) => void }) {
  const [amounts, setAmounts] = useState<Record<number, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.balance.toFixed(2)])));
  const [method, setMethod] = useState<(typeof METHODS)[number]>("Cash");
  const [combine, setCombine] = useState(rows.length > 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = rows.map((r) => ({ row: r, value: Number((amounts[r.id] ?? "").trim()) }));
  const bad = parsed.find((p) => (amounts[p.row.id] ?? "").trim() !== "" && (!Number.isFinite(p.value) || p.value < 0 || p.value > p.row.balance + PAISA));
  const total = parsed.reduce((s, p) => s + (Number.isFinite(p.value) && p.value > 0 ? Math.min(p.value, p.row.balance) : 0), 0);
  const canSave = !bad && total > PAISA && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const pay = parsed.filter((p) => Number.isFinite(p.value) && p.value > PAISA);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ecommerce/due-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditIds: pay.map((p) => p.row.id), amounts: pay.map((p) => Math.min(p.value, p.row.balance)), paymentMethod: method, combineReceipt: combine }),
      });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; receipts?: string[] };
      if (!res.ok || d.success !== true) {
        setError(d.message || "Could not record the payment. Please try again.");
        return;
      }
      const receipts = d.receipts?.length ? ` Receipt${d.receipts.length > 1 ? "s" : ""}: ${d.receipts.join(", ")}` : "";
      onDone(`${money(Math.round(total * 100) / 100)} collected from ${rows.length === 1 ? rows[0].customerName : `${pay.length} dues`}.${receipts}`);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      wide={rows.length > 1}
      title={rows.length === 1 ? `Collect from ${rows[0].customerName}` : `Collect from ${rows.length} dues`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-4 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
          <button type="submit" form="collect-form" disabled={!canSave} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#3d8b5f] px-5 text-sm font-semibold text-white hover:bg-[#33774f] disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Record {money(Math.round(total * 100) / 100)}
          </button>
        </>
      }
    >
      <form id="collect-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="overflow-hidden rounded-[0.5rem] border border-admin-gray-200">
          {rows.map((r) => (
            <label key={r.id} className="flex items-center gap-3 border-b border-admin-gray-100 px-3.5 py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-admin-gray-900">{r.customerName}</span>
                <span className="block text-xs text-admin-gray-500">{r.orderNumber ?? `#${r.orderId}`} · owes {money(r.balance)}</span>
              </span>
              <span className="relative w-[150px] shrink-0">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-admin-gray-500">₹</span>
                <input inputMode="decimal" value={amounts[r.id] ?? ""} aria-label={`Amount to collect from ${r.customerName}`}
                  onChange={(e) => { setAmounts((a) => ({ ...a, [r.id]: e.target.value })); setError(null); }}
                  className={cn(inputCls, "pl-7", Number(amounts[r.id]) > r.balance + PAISA && "border-red-400")} />
              </span>
            </label>
          ))}
        </div>
        {bad && <p className="text-xs text-red-600">An amount can&apos;t be more than what is owed ({money(bad.row.balance)}) or below ₹0.</p>}

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-admin-gray-800">Payment method</span>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}
                className={cn("h-10 rounded-[0.375rem] border px-4 text-sm font-medium", method === m ? "border-[#2563eb] bg-blue-50/60 text-[#2563eb]" : "border-admin-gray-200 bg-white text-admin-gray-700 hover:bg-admin-gray-50")}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {rows.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-admin-gray-700">
            <input type="checkbox" checked={combine} onChange={(e) => setCombine(e.target.checked)} className="h-4 w-4 accent-[#2563eb]" />
            One receipt number for all of these
          </label>
        )}
        <p className="text-xs text-admin-gray-500">A due is marked Paid on its own once the balance reaches zero.</p>
        {error && <p role="alert" className="rounded-[0.375rem] bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}

/** Set or clear the date the customer promised to pay. */
function PromiseDateDialog({ row, today, onClose, onDone }: { row: Due2Row; today: string; onClose: () => void; onDone: (message: string) => void }) {
  const [date, setDate] = useState(row.promisedDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(value: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ecommerce/due/set-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Noon India time, so the day can't shift when it's read back.
        body: JSON.stringify({ creditId: row.id, promisedDate: value ? `${value}T12:00:00+05:30` : null }),
      });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || d.success !== true) {
        setError(d.message || "Could not save the date. Please try again.");
        return;
      }
      onDone(value ? `${row.customerName}: promise date set to ${longDate(value)}.` : `${row.customerName}: promise date removed.`);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Promise date — ${row.customerName}`}
      onClose={onClose}
      footer={
        <>
          {row.promisedDate && <button type="button" disabled={saving} onClick={() => save(null)} className="mr-auto h-10 rounded-[0.375rem] border border-[#dee2e6] bg-white px-4 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50">Remove date</button>}
          <button type="button" onClick={onClose} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-4 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
          <button type="button" disabled={saving || !date} onClick={() => save(date)} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save date
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-admin-gray-600">The day the customer said they would pay. Dues past this date show as Overdue and come first in the list.</p>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setError(null); }} aria-label="Promise date" className={inputCls} />
        <div className="flex flex-wrap gap-1.5">
          {([["Today", 0], ["Tomorrow", 1], ["+3 days", 3], ["+7 days", 7], ["+15 days", 15]] as [string, number][]).map(([label, n]) => (
            <button key={label} type="button" onClick={() => { setDate(shiftYmd(today, n)); setError(null); }} className="rounded-full border border-admin-gray-200 bg-white px-3 py-1 text-xs text-admin-gray-700 hover:bg-admin-gray-50">{label}</button>
          ))}
        </div>
        <p className="text-xs text-admin-gray-500">Owes {money(row.balance)} on {row.orderNumber ?? `#${row.orderId}`}.</p>
        {error && <p role="alert" className="rounded-[0.375rem] bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}

function HistoryDialog({ row, onClose }: { row: Due2Row; onClose: () => void }) {
  return (
    <Modal title={`Payments — ${row.customerName}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-admin-gray-700">
          <span>Order: <b className="text-admin-gray-900">{row.orderNumber ?? `#${row.orderId}`}</b></span>
          <span>Total: <b className="text-admin-gray-900">{money(row.amount)}</b></span>
          <span>Paid: <b className="text-emerald-600">{money(row.amountPaid)}</b></span>
          <span>Balance: <b className="text-[#dc3545]">{money(row.balance)}</b></span>
        </div>
        {row.payments.length === 0 ? (
          <p className="rounded-[0.5rem] bg-admin-gray-50 px-3.5 py-6 text-center text-sm text-admin-gray-500">No payment has been recorded against this due yet.</p>
        ) : (
          <div className="overflow-hidden rounded-[0.5rem] border border-admin-gray-200">
            {row.payments.map((p, i) => (
              <div key={`${p.receiptNumber}-${i}`} className="flex items-center justify-between gap-3 border-b border-admin-gray-100 px-3.5 py-2.5 text-sm last:border-b-0">
                <span className="min-w-0">
                  <Link href={`/admin/ecommerce/payment-receipt/${encodeURIComponent(p.receiptNumber)}`} className="block truncate font-medium text-[#2563eb] hover:underline">{p.receiptNumber}</Link>
                  <span className="block text-xs text-admin-gray-500">{fmtDateTime(p.createdAt)} · {p.paymentMethod}{p.createdByName ? ` · by ${p.createdByName}` : ""}</span>
                </span>
                <b className="shrink-0 text-emerald-600">{money(p.amount)}</b>
              </div>
            ))}
          </div>
        )}
        {row.productNames.length > 0 && (
          <p className="text-xs leading-5 text-admin-gray-500">Items on this order: {row.productNames.join(", ")}</p>
        )}
      </div>
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
    { key: "yesterday", label: "Yesterday", range: [shiftYmd(today, -1), shiftYmd(today, -1)] },
    { key: "7days", label: "7 Days", range: [shiftYmd(today, -6), today] },
    { key: "this_month", label: "This Month", range: [firstThis, today] },
    { key: "prev_month", label: "Previous Month", range: [`${lastPrev.slice(0, 8)}01`, lastPrev] },
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
      <p className="mt-2 flex items-center gap-1.5 text-xs text-admin-gray-500">
        <ArrowRight className="h-3 w-3" /> The date range changes the &ldquo;Collected in Range&rdquo; card. To filter the table by date too, set &ldquo;Date range applies to&rdquo;.
      </p>
    </section>
  );
}
