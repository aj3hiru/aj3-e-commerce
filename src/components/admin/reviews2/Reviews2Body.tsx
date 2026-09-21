"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowDown, ArrowUp, CalendarDays, CheckCircle2, ChevronDown, ChevronsUpDown, Clock, Download, FolderTree,
  Loader2, MessageSquare, Plus, Search, Star, ThumbsDown, Trash2, SquarePen, X, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { Review2Row, Reviews2Data } from "@/lib/reviews2";
import { parseReviewInput } from "@/lib/review2-save";
import { ConfirmDialog, Modal, Pager, Thumb } from "@/components/admin/campaigns2/ui";
import { IconAction, StatusPill, type PillOption } from "@/components/admin/ui/buttons";

const PAGE_PATH = "/admin/ecommerce/product-reviews2";

type ReviewStatus = "pending" | "approved" | "rejected";
/** Same words and colours as the rest of the admin: Pending is amber, Approved green, Rejected red. */
const REVIEW_STATUS: readonly PillOption<ReviewStatus>[] = [
  { value: "pending", label: "Pending", variant: "warning" },
  { value: "approved", label: "Approved", variant: "success" },
  { value: "rejected", label: "Rejected", variant: "danger" },
];
const EVT_EXPORT = "reviews2:export";
const EVT_NEW = "reviews2:new";

export function Reviews2HeaderButtons() {
  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_EXPORT))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]">
        <Download className="h-4 w-4" /> Export
      </button>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_NEW))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-blue-600 px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
        <Plus className="h-4 w-4" /> Add Review
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
const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
function fmtDateTime(iso: string) {
  const p = Object.fromEntries(dtFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
}
const istYmdOf = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
/** An instant → what a datetime-local input shows in India time. */
const toIstInput = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 16);
const fromIstInput = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? new Date(`${v}:00+05:30`).toISOString() : null);

type SortKey = "created" | "rating" | "product" | "customer";
interface Filters {
  status: "all" | "pending" | "approved" | "rejected";
  rating: "all" | "1" | "2" | "3" | "4" | "5" | "low" | "high";
  category: string;
  product: string;
  text: "all" | "with" | "without";
  dateOn: boolean;
}
const NO_FILTERS: Filters = { status: "all", rating: "all", category: "all", product: "all", text: "all", dateOn: false };

const ROW_H = 96;
const HEAD_H = 50;
const MIN_ROWS = 4;
const td = "border border-[#dee2e6] px-3 align-middle";

export function Reviews2Body({ data, range, notice }: { data: Reviews2Data; range: { from: string; to: string }; notice?: string | null }) {
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
  const [editor, setEditor] = useState<{ review: Review2Row | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Review2Row | null>(null);
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
      if (f.status !== "all" && r.status !== f.status) return false;
      if (f.rating === "low" && r.rating > 2) return false;
      if (f.rating === "high" && r.rating < 4) return false;
      if (["1", "2", "3", "4", "5"].includes(f.rating) && r.rating !== Number(f.rating)) return false;
      if (f.category !== "all" && String(r.categoryId) !== f.category) return false;
      if (f.product !== "all" && String(r.productId) !== f.product) return false;
      if (f.text === "with" && !(r.reviewText ?? "").trim()) return false;
      if (f.text === "without" && (r.reviewText ?? "").trim()) return false;
      if (f.dateOn) {
        const d = istYmdOf(r.createdAt);
        if (d < range.from || d > range.to) return false;
      }
      if (term) {
        const hay = `${r.customerName} ${r.customerPhone ?? ""} ${r.orderNumber ?? ""} ${r.orderId ?? ""} ${r.productName} ${r.categoryName ?? ""} ${r.brandName ?? ""} ${r.reviewText ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "rating": return (a.rating - b.rating) * dir || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "product": return a.productName.toLowerCase().localeCompare(b.productName.toLowerCase()) * dir;
        case "customer": return a.customerName.toLowerCase().localeCompare(b.customerName.toLowerCase()) * dir;
        default: return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
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
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "product" || key === "customer" ? "asc" : "desc" }));
  }

  async function setStatus(r: Review2Row, status: "pending" | "approved" | "rejected") {
    if (r.status === status) return;
    setBusy((s) => new Set(s).add(r.id));
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status } : x)));
    try {
      const res = await fetch(`/api/ecommerce/reviews2/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || d.success !== true) {
        setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status: r.status } : x)));
        setToast({ ok: false, text: d.message || "Could not change the status. Please try again." });
        return;
      }
      setToast({ ok: true, text: `Review by ${r.customerName} ${status === "approved" ? "approved — it now shows on the shop" : status === "rejected" ? "rejected — hidden from the shop" : "moved back to pending"}.` });
      router.refresh();
    } catch {
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status: r.status } : x)));
      setToast({ ok: false, text: "Could not reach the server. Please try again." });
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(r.id); return n; });
    }
  }

  async function remove(r: Review2Row) {
    setBusy((s) => new Set(s).add(r.id));
    try {
      const res = await fetch(`/api/ecommerce/reviews2/${r.id}`, { method: "DELETE" });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || d.success !== true) {
        setToast({ ok: false, text: d.message || "Could not delete the review. Please try again." });
        return;
      }
      setRows((list) => list.filter((x) => x.id !== r.id));
      setToast({ ok: true, text: `Review by ${r.customerName} deleted.` });
      router.refresh();
    } catch {
      setToast({ ok: false, text: "Could not reach the server. Please try again." });
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(r.id); return n; });
      setConfirmDelete(null);
    }
  }

  function exportCsv() {
    if (filtered.length === 0) return setToast({ ok: false, text: "There are no reviews to export." });
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["ID", "Date", "Product", "Category", "Customer", "Phone", "Order", "Rating", "Status", "Review"].join(",")];
    for (const r of filtered) {
      lines.push([r.id, fmtDateTime(r.createdAt), r.productName, r.categoryName, r.customerName, r.customerPhone, r.orderNumber, r.rating, r.status, r.reviewText].map(cell).join(","));
    }
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `product-reviews-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const exportRef = useRef(exportCsv);
  exportRef.current = exportCsv;
  useEffect(() => {
    const onExport = () => exportRef.current();
    const onNew = () => setEditor({ review: null });
    window.addEventListener(EVT_EXPORT, onExport);
    window.addEventListener(EVT_NEW, onNew);
    return () => {
      window.removeEventListener(EVT_EXPORT, onExport);
      window.removeEventListener(EVT_NEW, onNew);
    };
  }, []);

  const navigate = (url: string) => startNavigate(() => router.push(url, { scroll: false }));
  const maxSpread = Math.max(1, ...data.ratingSpread.map((s) => s.count));

  const cols = [
    { key: "rv2-c-product", w: "w-[250px]" },
    { key: "rv2-c-customer", w: "w-[190px]" },
    { key: "rv2-c-rating", w: "w-[130px]" },
    { key: "rv2-c-review", w: "" },
    { key: "rv2-c-status", w: "w-[140px]" },
    { key: "rv2-c-actions", w: "w-[150px]" },
  ].filter((x) => show("rv2-table") && show(x.key));

  return (
    <div className={cn("space-y-5", !loaded && "invisible")} aria-busy={navigating}>
      {show("rv2-range") && <RangeBar range={range} navigate={navigate} pending={navigating} dateOn={f.dateOn} onDateOn={(v) => set("dateOn", v)} />}

      {show("rv2-cards") && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {show("rv2-k-total") && <Card icon={MessageSquare} tint="bg-blue-50 text-blue-600" value={String(c.total)} label="All Reviews" sub={`${c.withText} with a message`} on={!filtersActive} onClick={() => applyCard({})} />}
          {show("rv2-k-today") && <Card icon={Clock} tint="bg-violet-50 text-violet-600" value={String(c.today)} label="Today" sub={`${c.yesterday} yesterday`} on={false} onClick={() => { applyCard({ dateOn: true }); navigate(`${PAGE_PATH}?from=${data.today}&to=${data.today}`); }} />}
          {show("rv2-k-pending") && <Card icon={Clock} tint="bg-amber-50 text-amber-600" value={String(c.pending)} label="Pending Reviews" sub="not shown on the shop yet" on={f.status === "pending"} onClick={() => applyCard({ status: "pending" })} />}
          {show("rv2-k-approved") && <Card icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" value={String(c.approved)} label="Approved" sub="live on the shop" on={f.status === "approved"} onClick={() => applyCard({ status: "approved" })} />}
          {show("rv2-k-rejected") && <Card icon={XCircle} tint="bg-slate-100 text-slate-600" value={String(c.rejected)} label="Rejected" sub="hidden from the shop" on={f.status === "rejected"} onClick={() => applyCard({ status: "rejected" })} />}
          {show("rv2-k-average") && <Card icon={Star} tint="bg-amber-50 text-amber-500" value={c.averageRating ? `${c.averageRating.toFixed(1)}★` : "—"} label="Average Rating" sub="across all reviews" on={false} onClick={() => applyCard({})} />}
          {show("rv2-k-low") && <Card icon={ThumbsDown} tint="bg-red-50 text-red-600" value={String(c.lowRatings)} label="Low Ratings (1–2★)" sub="worth a look" on={f.rating === "low"} onClick={() => applyCard({ rating: "low" })} />}
          {show("rv2-k-range") && <Card icon={CalendarDays} tint="bg-sky-50 text-sky-600" value={String(c.inRange)} label="In Selected Range" sub={`${longDate(range.from)} – ${longDate(range.to)}`} on={f.dateOn} onClick={() => applyCard({ dateOn: true })} />}
        </div>
      )}

      {show("rv2-spread") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2.5 text-base font-semibold text-admin-gray-900"><Star className="h-5 w-5 text-amber-500" /> Ratings Breakdown</h2>
          <div className="space-y-1.5">
            {[...data.ratingSpread].reverse().map((s) => (
              <button key={s.rating} type="button" onClick={() => applyCard({ rating: String(s.rating) as Filters["rating"] })}
                className="flex w-full items-center gap-3 rounded-md px-1 py-0.5 text-left hover:bg-admin-gray-50" title={`Show ${s.rating}-star reviews`}>
                <span className="flex w-12 shrink-0 items-center gap-1 text-sm text-admin-gray-700">{s.rating} <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /></span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-admin-gray-100">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(s.count / maxSpread) * 100}%` }} />
                </span>
                <span className="w-12 shrink-0 text-right text-sm text-admin-gray-700">{s.count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {show("rv2-filters") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {show("rv2-f-status") && (
              <Select icon={CheckCircle2} label="Status" value={f.status} onChange={(v) => set("status", v as Filters["status"])} on={f.status !== "all"}>
                <option value="all">All status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </Select>
            )}
            {show("rv2-f-rating") && (
              <Select icon={Star} label="Rating" value={f.rating} onChange={(v) => set("rating", v as Filters["rating"])} on={f.rating !== "all"}>
                <option value="all">All ratings</option>
                <option value="high">4★ and above</option>
                <option value="low">2★ and below</option>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={String(n)}>{n} star{n === 1 ? "" : "s"}</option>)}
              </Select>
            )}
            {show("rv2-f-category") && (
              <Select icon={FolderTree} label="Category" value={f.category} onChange={(v) => set("category", v)} on={f.category !== "all"}>
                <option value="all">All categories</option>
                {data.categories.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}
              </Select>
            )}
            {show("rv2-f-product") && (
              <Select icon={MessageSquare} label="Product" value={f.product} onChange={(v) => set("product", v)} on={f.product !== "all"}>
                <option value="all">All products</option>
                {[...new Map(rows.map((r) => [r.productId, r.productName])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => (
                  <option key={id} value={String(id)}>{name}</option>
                ))}
              </Select>
            )}
            {show("rv2-f-text") && (
              <Select icon={MessageSquare} label="Message" value={f.text} onChange={(v) => set("text", v as Filters["text"])} on={f.text !== "all"}>
                <option value="all">All reviews</option>
                <option value="with">With a message</option>
                <option value="without">Rating only</option>
              </Select>
            )}
          </div>
        </section>
      )}

      {show("rv2-table") && (
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
            {show("rv2-t-search") && (
              <label className="ml-auto flex items-center gap-2">
                Search:
                <span className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search reviews" placeholder="Name, phone, order, product, words…"
                    className="h-10 w-[280px] rounded-[0.375rem] border border-[#dee2e6] pl-8 pr-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
                </span>
              </label>
            )}
          </div>

          <div className="overflow-x-auto" style={{ minHeight: pageSize === 0 ? undefined : HEAD_H + Math.min(pageSize, MIN_ROWS) * ROW_H }}>
            <table className="w-full min-w-[1100px] table-fixed border-collapse text-[15px]">
              <colgroup>{cols.map((x) => <col key={x.key} className={x.w} />)}</colgroup>
              <thead>
                <tr className="bg-[#f8f9fa] text-left font-bold text-admin-gray-900" style={{ height: HEAD_H }}>
                  {show("rv2-c-product") && <SortTh label="Product" active={sort.key === "product" ? sort.dir : null} onClick={() => toggleSort("product")} />}
                  {show("rv2-c-customer") && <SortTh label="Name" active={sort.key === "customer" ? sort.dir : null} onClick={() => toggleSort("customer")} />}
                  {show("rv2-c-rating") && <SortTh label="Rating" active={sort.key === "rating" ? sort.dir : null} onClick={() => toggleSort("rating")} />}
                  {show("rv2-c-review") && <th className={td}>Review</th>}
                  {show("rv2-c-status") && <th className={td}>Status</th>}
                  {show("rv2-c-actions") && <th className={td}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={cols.length || 1} className={cn(td, "py-12 text-center text-admin-gray-500")}>
                      {rows.length === 0 ? (
                        <span className="inline-flex flex-col items-center gap-3">
                          <span>No reviews yet.</span>
                          <button type="button" onClick={() => setEditor({ review: null })} className="flex h-10 items-center gap-2 rounded-[0.5rem] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Add Review</button>
                        </span>
                      ) : "No reviews match these filters."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => {
                    const isBusy = busy.has(r.id);
                    return (
                      <tr key={r.id} style={{ height: ROW_H }} className={cn("odd:bg-[#f2f2f2] even:bg-white", isBusy && "opacity-60")}>
                        {show("rv2-c-product") && (
                          <td className={td}>
                            <div className="flex items-center gap-2.5">
                              <Thumb src={r.productImage} name={r.productName} size={44} />
                              <span className="min-w-0">
                                <Link href={`/admin/ecommerce/add-product2?edit=${r.productId}`} title={`Edit ${r.productName}`} className="block truncate text-admin-gray-900 hover:text-[#2563eb] hover:underline">{r.productName}</Link>
                                <span className="block truncate text-xs text-admin-gray-500">{r.categoryName ?? "Uncategorized"}</span>
                              </span>
                            </div>
                          </td>
                        )}
                        {show("rv2-c-customer") && (
                          <td className={td}>
                            {r.customerId !== null
                              ? <Link href={`/admin/ecommerce/customers/${r.customerId}`} className="block truncate font-medium text-admin-gray-900 hover:text-[#2563eb] hover:underline">{r.customerName}</Link>
                              : <span className="block truncate font-medium text-admin-gray-900">{r.customerName}</span>}
                            <span className="block truncate text-xs text-admin-gray-500" title={r.phoneFromName ? "Phone matched by name" : undefined}>
                              {r.customerPhone ?? "No phone"}{r.phoneFromName ? " (by name)" : ""}
                            </span>
                            <span className="block truncate text-xs text-admin-gray-400">{r.orderNumber ? r.orderNumber : fmtDateTime(r.createdAt).split(",")[0]}</span>
                          </td>
                        )}
                        {show("rv2-c-rating") && (
                          <td className={td}>
                            <Stars value={r.rating} />
                            <span className="mt-0.5 block text-xs text-admin-gray-500">{fmtDateTime(r.createdAt).split(",")[0]}</span>
                          </td>
                        )}
                        {show("rv2-c-review") && (
                          <td className={cn(td, "py-2")}>
                            {(r.reviewText ?? "").trim()
                              ? <button type="button" onClick={() => setEditor({ review: r })} title="Open this review" className="line-clamp-3 w-full text-left text-[14px] leading-5 text-admin-gray-700 hover:text-admin-gray-900">{r.reviewText}</button>
                              : <span className="text-sm text-admin-gray-400">No message — rating only</span>}
                          </td>
                        )}
                        {show("rv2-c-status") && (
                          <td className={td}>
                            <StatusPill
                              label={`Change status of review by ${r.customerName}`}
                              value={(r.status === "approved" || r.status === "rejected" ? r.status : "pending") as ReviewStatus}
                              options={REVIEW_STATUS}
                              disabled={isBusy}
                              onChange={(next) => setStatus(r, next)}
                            />
                          </td>
                        )}
                        {show("rv2-c-actions") && (
                          <td className={td}>
                            <div className="flex gap-[0.4rem]">
                              <IconAction tone="edit" onClick={() => setEditor({ review: r })} title={`Edit review by ${r.customerName}`}><SquarePen /></IconAction>
                              <IconAction tone="delete" disabled={isBusy} onClick={() => setConfirmDelete(r)} title={`Delete review by ${r.customerName}`}><Trash2 /></IconAction>
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
            {pageCount > 1 && <Pager page={cur} pageCount={pageCount} onPage={setPage} label="Review pages" />}
          </div>
        </section>
      )}

      {editor && (
        <ReviewEditor
          key={editor.review?.id ?? "new"}
          review={editor.review}
          products={data.products}
          customers={data.customers}
          onClose={() => setEditor(null)}
          onSaved={(msg) => { setEditor(null); setToast({ ok: true, text: msg }); router.refresh(); }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          danger
          busy={busy.has(confirmDelete.id)}
          title="Delete this review?"
          confirmLabel="Delete"
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => remove(confirmDelete)}
          body={<>The review by “{confirmDelete.customerName}” on {confirmDelete.productName} will be removed for good. To just hide it from the shop, reject it instead.</>}
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

function ReviewEditor({ review, products, customers, onClose, onSaved }: {
  review: Review2Row | null;
  products: Reviews2Data["products"];
  customers: Reviews2Data["customers"];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [productId, setProductId] = useState<number | null>(review?.productId ?? null);
  const [productQ, setProductQ] = useState("");
  const [name, setName] = useState(review?.customerName ?? "");
  const [customerId, setCustomerId] = useState<number | null>(review?.customerId ?? null);
  const [phone, setPhone] = useState(review?.customerPhone ?? "");
  const [orderNo, setOrderNo] = useState(review?.orderId ? String(review.orderId) : "");
  const [rating, setRating] = useState(review?.rating ?? 5);
  const [text, setText] = useState(review?.reviewText ?? "");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">((review?.status as "pending" | "approved" | "rejected") ?? "approved");
  const [when, setWhen] = useState(review ? toIstInput(review.createdAt) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productMatches = useMemo(() => {
    const t = productQ.trim().toLowerCase();
    return (t ? products.filter((p) => p.name.toLowerCase().includes(t)) : products).slice(0, 50);
  }, [products, productQ]);
  const chosenProduct = products.find((p) => p.id === productId) ?? null;

  const customerMatches = useMemo(() => {
    const t = name.trim().toLowerCase();
    if (!t || customerId !== null) return [];
    return customers.filter((c) => c.name.toLowerCase().includes(t) || (c.phone ?? "").includes(t)).slice(0, 6);
  }, [customers, name, customerId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      productId,
      customerName: name,
      customerId,
      customerPhone: phone,
      orderId: orderNo.trim() === "" ? null : Number(orderNo.trim()),
      rating,
      reviewText: text,
      status,
      createdAt: when ? fromIstInput(when) : null,
    };
    // The same rules the server applies, so most mistakes are caught before sending.
    const check = parseReviewInput(payload, { requireProduct: true });
    if (!check.ok) return setError(check.message);
    if (orderNo.trim() !== "" && !/^\d+$/.test(orderNo.trim())) return setError("The order id must be a number, or leave it blank.");

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(review ? `/api/ecommerce/reviews2/${review.id}` : "/api/ecommerce/reviews2", {
        method: review ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || d.success !== true) {
        setError(d.message || "Could not save the review. Please try again.");
        return;
      }
      onSaved(review ? "Review saved." : `Review by “${name.trim()}” added.`);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      title={review ? `Edit review — ${review.productName}` : "Add Review"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-4 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
          <button type="submit" form="review-form" disabled={saving} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {review ? "Save review" : "Add review"}
          </button>
        </>
      }
    >
      <form id="review-form" onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <span className={labelCls}>Product</span>
          {chosenProduct ? (
            <div className="flex items-center gap-3 rounded-[0.5rem] border border-admin-gray-200 px-3 py-2">
              <Thumb src={chosenProduct.image} name={chosenProduct.name} size={40} />
              <span className="min-w-0 flex-1 truncate text-sm text-admin-gray-900">{chosenProduct.name}</span>
              <button type="button" onClick={() => { setProductId(null); setProductQ(""); }} className="text-[13px] text-[#2563eb] hover:underline">Change</button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[0.5rem] border border-admin-gray-200">
              <div className="relative border-b border-admin-gray-100 bg-admin-gray-50 p-2">
                <Search className="pointer-events-none absolute left-4.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
                <input value={productQ} onChange={(e) => setProductQ(e.target.value)} placeholder="Search products…" aria-label="Search products"
                  className="h-9 w-full rounded-[0.375rem] border border-[#dee2e6] bg-white pl-8 pr-3 text-sm outline-none focus:border-[#86b7fe]" />
              </div>
              <div className="max-h-[180px] overflow-y-auto">
                {productMatches.length === 0 ? (
                  <p className="px-3.5 py-4 text-center text-[13px] text-admin-gray-500">No products match that.</p>
                ) : productMatches.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setProductId(p.id); setError(null); }}
                    className="flex w-full items-center gap-2.5 border-b border-admin-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-admin-gray-50">
                    <Thumb src={p.image} name={p.name} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm text-admin-gray-800">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="relative">
            <label htmlFor="rv-name" className={labelCls}>Reviewer name</label>
            <input id="rv-name" value={name} onChange={(e) => { setName(e.target.value); setCustomerId(null); setError(null); }} className={inputCls} placeholder="Type a name, or pick a customer" />
            {customerMatches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[0.5rem] border border-admin-gray-200 bg-white shadow-lg">
                {customerMatches.map((cu) => (
                  <button key={cu.id} type="button" onClick={() => { setCustomerId(cu.id); setName(cu.name); if (cu.phone) setPhone(cu.phone); }}
                    className="flex w-full items-center justify-between gap-2 border-b border-admin-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-admin-gray-50">
                    <span className="truncate text-admin-gray-800">{cu.name}</span>
                    <span className="shrink-0 text-xs text-admin-gray-500">{cu.phone ?? "no phone"}</span>
                  </button>
                ))}
              </div>
            )}
            {customerId !== null && <p className="mt-1 text-xs text-emerald-600">Linked to a customer — searching by phone will find this review.</p>}
          </div>
          <div>
            <label htmlFor="rv-phone" className={labelCls}>Phone <span className="font-normal text-admin-gray-500">(optional)</span></label>
            <input id="rv-phone" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }} className={inputCls} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <span className={labelCls}>Rating</span>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => { setRating(n); setError(null); }} className="p-0.5">
                  <Star className={cn("h-7 w-7", n <= rating ? "fill-amber-400 text-amber-400" : "text-admin-gray-300")} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="rv-order" className={labelCls}>Order id <span className="font-normal text-admin-gray-500">(optional)</span></label>
            <input id="rv-order" inputMode="numeric" value={orderNo} onChange={(e) => { setOrderNo(e.target.value); setError(null); }} className={inputCls} placeholder="e.g. 512" />
          </div>
          <div>
            <label htmlFor="rv-when" className={labelCls}>Date <span className="font-normal text-admin-gray-500">(India time)</span></label>
            <input id="rv-when" type="datetime-local" value={when} onChange={(e) => { setWhen(e.target.value); setError(null); }} className={inputCls} />
          </div>
        </div>

        <div>
          <label htmlFor="rv-text" className={labelCls}>Review <span className="font-normal text-admin-gray-500">(optional)</span></label>
          <textarea id="rv-text" rows={4} maxLength={5000} value={text} onChange={(e) => { setText(e.target.value); setError(null); }}
            className="w-full rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 py-2 text-sm outline-none focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15" />
        </div>

        <div>
          <span className={labelCls}>Status</span>
          <div className="inline-flex gap-1 rounded-[0.5rem] border border-admin-gray-200 bg-admin-gray-50 p-1" role="radiogroup" aria-label="Status">
            {([["approved", "Approved"], ["pending", "Pending"], ["rejected", "Rejected"]] as const).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={status === k} onClick={() => setStatus(k)}
                className={cn("rounded-[0.375rem] px-3.5 py-1.5 text-sm font-medium transition-colors", status === k ? "bg-white text-[#2563eb] shadow-sm" : "text-admin-gray-600 hover:text-admin-gray-900")}>
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-admin-gray-500">Only approved reviews show on the product page in the shop.</p>
        </div>

        {error && <p role="alert" className="rounded-[0.375rem] bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}

/* ───────────────────────── small pieces ───────────────────────── */

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cn("h-4 w-4", n <= value ? "fill-amber-400 text-amber-400" : "text-admin-gray-300")} />)}
    </span>
  );
}

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
        <span className="block truncate text-xl font-bold leading-tight text-admin-gray-900">{value}</span>
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

function RangeBar({ range, navigate, pending, dateOn, onDateOn }: {
  range: { from: string; to: string }; navigate: (url: string) => void; pending: boolean; dateOn: boolean; onDateOn: (v: boolean) => void;
}) {
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
        <label className="flex items-center gap-2 text-sm text-admin-gray-700">
          <input type="checkbox" checked={dateOn} onChange={(e) => onDateOn(e.target.checked)} className="h-4 w-4 accent-[#2563eb]" />
          Filter the table by this range
        </label>
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
