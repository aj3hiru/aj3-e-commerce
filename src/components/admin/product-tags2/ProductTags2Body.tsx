"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowDown, ArrowUp, BadgeCheck, CheckCircle2, ChevronDown, ChevronsUpDown, Download, EyeOff, IndianRupee,
  Loader2, Package, Plus, Search, ShoppingCart, SquarePen, Tag, Tags, Trash2, TriangleAlert, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { Tag2Row, TagGroup, Tags2Data } from "@/lib/product-tags2";
import { parseTagInput, slugify } from "@/lib/tag2-save";
import { ConfirmDialog, Modal, Pager } from "@/components/admin/campaigns2/ui";
import { IconAction, StatusPill, type PillOption } from "@/components/admin/ui/buttons";
import { money } from "@/components/admin/campaigns2/format";

const PAGE_PATH = "/admin/ecommerce/product-tags2";

const TAG_STATUS: readonly PillOption<"active" | "inactive">[] = [
  { value: "active", label: "Active", variant: "success" },
  { value: "inactive", label: "Inactive", variant: "secondary" },
];
const EVT_EXPORT = "tags2:export";
const EVT_NEW = "tags2:new";

export function Tags2HeaderButtons() {
  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_EXPORT))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]">
        <Download className="h-4 w-4" /> Export
      </button>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_NEW))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-blue-600 px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
        <Plus className="h-4 w-4" /> Add Tag
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

type SortKey = "order" | "label" | "products" | "units" | "revenue";
interface Filters {
  group: "all" | TagGroup;
  status: "all" | "active" | "inactive";
  usage: "all" | "used" | "unused" | "sold" | "nosales";
}
const NO_FILTERS: Filters = { group: "all", status: "all", usage: "all" };

const ROW_H = 76;
const HEAD_H = 50;
const MIN_ROWS = 5;
const td = "border border-[#dee2e6] px-3 align-middle";

export function Tags2Body({ data, range }: { data: Tags2Data; range: { from: string; to: string } }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [navigating, startNavigate] = useTransition();

  const [rows, setRows] = useState(data.rows);
  useEffect(() => setRows(data.rows), [data.rows]);

  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "order", dir: "asc" });
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [editor, setEditor] = useState<{ tag: Tag2Row | null; group: TagGroup; label?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ tag: Tag2Row; used: number } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
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
      if (f.group !== "all" && r.tagGroup !== f.group) return false;
      if (f.status === "active" && r.status !== "active") return false;
      if (f.status === "inactive" && r.status === "active") return false;
      if (f.usage === "used" && r.products === 0) return false;
      if (f.usage === "unused" && r.products > 0) return false;
      if (f.usage === "sold" && r.unitsSold === 0) return false;
      if (f.usage === "nosales" && r.unitsSold > 0) return false;
      if (term && !`${r.label} ${r.slug}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "label": return a.label.toLowerCase().localeCompare(b.label.toLowerCase()) * dir;
        case "products": return (a.products - b.products) * dir;
        case "units": return (a.unitsSold - b.unitsSold) * dir;
        case "revenue": return (a.revenue - b.revenue) * dir;
        default:
          // Badges first, then each group in its own display order.
          if (a.tagGroup !== b.tagGroup) return a.tagGroup === "badge" ? -1 : 1;
          return (a.sortOrder - b.sortOrder || a.id - b.id) * dir;
      }
    });
  }, [rows, f, q, sort]);

  useEffect(() => setPage(1), [f, q, sort, pageSize, range]);
  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  const start = pageSize === 0 ? 0 : (cur - 1) * pageSize;
  const pageRows = pageSize === 0 ? filtered : filtered.slice(start, start + pageSize);
  const filtersActive = JSON.stringify(f) !== JSON.stringify(NO_FILTERS) || search.trim() !== "";
  const maxUnits = Math.max(1, ...rows.map((r) => r.unitsSold));

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "label" || key === "order" ? "asc" : "desc" }));
  }

  async function setStatus(r: Tag2Row, status: "active" | "inactive") {
    setBusy((s) => new Set(s).add(r.id));
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status } : x)));
    try {
      const res = await fetch(`/api/ecommerce/product-tags2/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || d.success !== true) {
        setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status: r.status } : x)));
        setToast({ ok: false, text: d.message || "Could not change the status. Please try again." });
        return;
      }
      setToast({ ok: true, text: `“${r.label}” is now ${status === "active" ? "active" : "inactive"}.` });
      router.refresh();
    } catch {
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status: r.status } : x)));
      setToast({ ok: false, text: "Could not reach the server. Please try again." });
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(r.id); return n; });
    }
  }

  async function remove(r: Tag2Row, force: boolean) {
    setBusy((s) => new Set(s).add(r.id));
    try {
      const res = await fetch(`/api/ecommerce/product-tags2/${r.id}${force ? "?force=1" : ""}`, { method: "DELETE" });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; needsConfirm?: boolean; used?: number };
      if (d.needsConfirm) {
        // Products still carry it — ask before clearing them.
        setConfirmDelete({ tag: r, used: d.used ?? 0 });
        return;
      }
      if (!res.ok || d.success !== true) {
        setToast({ ok: false, text: d.message || "Could not delete the tag. Please try again." });
        return;
      }
      setRows((list) => list.filter((x) => x.id !== r.id));
      setConfirmDelete(null);
      setToast({ ok: true, text: d.used ? `“${r.label}” deleted; ${d.used} product${d.used === 1 ? "" : "s"} moved to “no tag”.` : `“${r.label}” deleted.` });
      router.refresh();
    } catch {
      setToast({ ok: false, text: "Could not reach the server. Please try again." });
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(r.id); return n; });
    }
  }

  function exportCsv() {
    if (filtered.length === 0) return setToast({ ok: false, text: "There is nothing to export." });
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["ID", "Type", "Name", "Code", "Colour", "Order", "Status", "Products", "Active Products", "Units Sold (range)", "Revenue (range)", "Orders (range)", "Units Sold (all time)"].join(",")];
    for (const r of filtered) {
      lines.push([r.id, r.tagGroup === "badge" ? "Badge Tag" : "Item Type", r.label, r.slug, r.color, r.sortOrder, r.status,
        r.products, r.activeProducts, r.unitsSold, r.revenue.toFixed(2), r.orders, r.unitsSoldAllTime].map(cell).join(","));
    }
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `badge-tags-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const exportRef = useRef(exportCsv);
  exportRef.current = exportCsv;
  useEffect(() => {
    const onExport = () => exportRef.current();
    const onNew = () => setEditor({ tag: null, group: "badge" });
    window.addEventListener(EVT_EXPORT, onExport);
    window.addEventListener(EVT_NEW, onNew);
    return () => {
      window.removeEventListener(EVT_EXPORT, onExport);
      window.removeEventListener(EVT_NEW, onNew);
    };
  }, []);

  const navigate = (url: string) => startNavigate(() => router.push(url, { scroll: false }));

  const cols = [
    { key: "tg2-c-tag", w: "" },
    { key: "tg2-c-group", w: "w-[130px]" },
    { key: "tg2-c-products", w: "w-[130px]" },
    { key: "tg2-c-sales", w: "w-[230px]" },
    { key: "tg2-c-revenue", w: "w-[150px]" },
    { key: "tg2-c-status", w: "w-[130px]" },
    { key: "tg2-c-actions", w: "w-[130px]" },
  ].filter((x) => show("tg2-table") && show(x.key));

  return (
    <div className={cn("space-y-5", !loaded && "invisible")} aria-busy={navigating}>
      {show("tg2-range") && <RangeBar range={range} navigate={navigate} pending={navigating} />}

      {show("tg2-cards") && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {show("tg2-k-badges") && <Card icon={Tag} tint="bg-violet-50 text-violet-600" value={String(c.badges)} label="Badge Tags" sub="shown on product cards" on={f.group === "badge"} onClick={() => applyCard({ group: "badge" })} />}
          {show("tg2-k-types") && <Card icon={Tags} tint="bg-blue-50 text-blue-600" value={String(c.itemTypes)} label="Item Types" sub="how products are grouped" on={f.group === "item_type"} onClick={() => applyCard({ group: "item_type" })} />}
          {show("tg2-k-active") && <Card icon={BadgeCheck} tint="bg-emerald-50 text-emerald-600" value={String(c.active)} label="Active" sub={`${c.inactive} inactive`} on={f.status === "active"} onClick={() => applyCard({ status: "active" })} />}
          {show("tg2-k-unused") && <Card icon={EyeOff} tint="bg-slate-100 text-slate-600" value={String(c.unused)} label="Not Used" sub="no product has these" on={f.usage === "unused"} onClick={() => applyCard({ usage: "unused" })} />}
          {show("tg2-k-tagged") && <Card icon={Package} tint="bg-sky-50 text-sky-600" value={String(c.taggedProducts)} label="Tagged Products" sub={`${c.untaggedProducts} with no badge`} on={false} onClick={() => applyCard({ usage: "used" })} />}
          {show("tg2-k-units") && <Card icon={ShoppingCart} tint="bg-amber-50 text-amber-600" value={String(c.unitsSold)} label="Units Sold" sub="from badged products" on={f.usage === "sold"} onClick={() => applyCard({ usage: "sold" })} />}
          {show("tg2-k-revenue") && <Card icon={IndianRupee} tint="bg-emerald-50 text-emerald-600" value={money(c.revenue)} label="Sales from Badges" sub={`${longDate(range.from)} – ${longDate(range.to)}`} on={false} onClick={() => applyCard({ usage: "sold" })} />}
          {show("tg2-k-top") && <Card icon={Tag} tint="bg-red-50 text-red-600" value={c.topLabel ?? "—"} label="Best Performing" sub={c.topLabel ? `${c.topUnits} units sold` : "no sales in this range"} on={false} onClick={() => applyCard({ usage: "sold" })} />}
        </div>
      )}

      {data.orphans.length > 0 && show("tg2-orphans") && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900"><TriangleAlert className="h-4 w-4" /> Values in use without a tag</h2>
          <p className="mt-1 text-[13px] text-amber-800">
            Some products carry a badge or type that isn&apos;t in this list, so the shop treats it as no tag. Add it here to use it properly.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {data.orphans.map((o) => (
              <button key={`${o.tagGroup}:${o.value}`} type="button" onClick={() => setEditor({ tag: null, group: o.tagGroup, label: o.value })}
                className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-[13px] text-amber-900 hover:bg-amber-100">
                <Plus className="h-3.5 w-3.5" /> {o.value} <span className="text-amber-700">({o.products})</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {show("tg2-filters") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {show("tg2-f-group") && (
              <Select icon={Tags} label="Tag Type" value={f.group} onChange={(v) => set("group", v as Filters["group"])} on={f.group !== "all"}>
                <option value="all">Badges and item types</option>
                <option value="badge">Badge tags only</option>
                <option value="item_type">Item types only</option>
              </Select>
            )}
            {show("tg2-f-status") && (
              <Select icon={BadgeCheck} label="Status" value={f.status} onChange={(v) => set("status", v as Filters["status"])} on={f.status !== "all"}>
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            )}
            {show("tg2-f-usage") && (
              <Select icon={Package} label="Usage" value={f.usage} onChange={(v) => set("usage", v as Filters["usage"])} on={f.usage !== "all"}>
                <option value="all">All tags</option>
                <option value="used">Used by products</option>
                <option value="unused">Not used</option>
                <option value="sold">Sold in this range</option>
                <option value="nosales">No sales in this range</option>
              </Select>
            )}
          </div>
        </section>
      )}

      {show("tg2-table") && (
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
            {show("tg2-t-search") && (
              <label className="ml-auto flex items-center gap-2">
                Search:
                <span className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search tags" placeholder="Name or code…"
                    className="h-10 w-[240px] rounded-[0.375rem] border border-[#dee2e6] pl-8 pr-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
                </span>
              </label>
            )}
          </div>

          <div className="overflow-x-auto" style={{ minHeight: pageSize === 0 ? undefined : HEAD_H + Math.min(pageSize, MIN_ROWS) * ROW_H }}>
            <table className="w-full min-w-[1020px] table-fixed border-collapse text-[15px]">
              <colgroup>{cols.map((x) => <col key={x.key} className={x.w} />)}</colgroup>
              <thead>
                <tr className="bg-[#f8f9fa] text-left font-bold text-admin-gray-900" style={{ height: HEAD_H }}>
                  {show("tg2-c-tag") && <SortTh label="Tag" active={sort.key === "label" ? sort.dir : null} onClick={() => toggleSort("label")} />}
                  {show("tg2-c-group") && <th className={td}>Type</th>}
                  {show("tg2-c-products") && <SortTh label="Products" active={sort.key === "products" ? sort.dir : null} onClick={() => toggleSort("products")} />}
                  {show("tg2-c-sales") && <SortTh label="Units Sold" active={sort.key === "units" ? sort.dir : null} onClick={() => toggleSort("units")} />}
                  {show("tg2-c-revenue") && <SortTh label="Sales" active={sort.key === "revenue" ? sort.dir : null} onClick={() => toggleSort("revenue")} />}
                  {show("tg2-c-status") && <th className={td}>Status</th>}
                  {show("tg2-c-actions") && <th className={td}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={cols.length || 1} className={cn(td, "py-12 text-center text-admin-gray-500")}>
                      {rows.length === 0 ? (
                        <span className="inline-flex flex-col items-center gap-3">
                          <span>No badge tags or item types yet.</span>
                          <button type="button" onClick={() => setEditor({ tag: null, group: "badge" })} className="flex h-10 items-center gap-2 rounded-[0.5rem] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Add Tag</button>
                        </span>
                      ) : "No tags match these filters."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => {
                    const isBusy = busy.has(r.id);
                    return (
                      <tr key={r.id} style={{ height: ROW_H }} className={cn("odd:bg-[#f2f2f2] even:bg-white", isBusy && "opacity-60")}>
                        {show("tg2-c-tag") && (
                          <td className={td}>
                            <div className="flex items-center gap-2.5">
                              {r.tagGroup === "badge" && (
                                <span className="inline-flex h-7 shrink-0 items-center rounded-[0.25rem] px-2.5 text-xs font-semibold text-white" style={{ background: r.color ?? "#6c757d" }}>{r.label}</span>
                              )}
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-admin-gray-900">{r.label}</span>
                                <span className="block truncate font-mono text-xs text-admin-gray-500">{r.slug}</span>
                              </span>
                            </div>
                          </td>
                        )}
                        {show("tg2-c-group") && (
                          <td className={td}>
                            <span className={cn("inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold", r.tagGroup === "badge" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700")}>
                              {r.tagGroup === "badge" ? "Badge" : "Item Type"}
                            </span>
                          </td>
                        )}
                        {show("tg2-c-products") && (
                          <td className={td}>
                            {r.products > 0 ? (
                              <Link href={`/admin/ecommerce/products2?${r.tagGroup === "badge" ? "badge" : "itemType"}=${encodeURIComponent(r.slug)}`}
                                className="font-medium text-[#2563eb] hover:underline">{r.products}</Link>
                            ) : <span className="text-admin-gray-400">0</span>}
                            <div className="text-xs text-admin-gray-500">{r.activeProducts} active</div>
                          </td>
                        )}
                        {show("tg2-c-sales") && (
                          <td className={td}>
                            <div className="flex items-center gap-2">
                              <span className="h-2 flex-1 overflow-hidden rounded-full bg-admin-gray-100">
                                <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(r.unitsSold / maxUnits) * 100}%` }} />
                              </span>
                              <b className="w-12 shrink-0 text-right text-admin-gray-900">{r.unitsSold}</b>
                            </div>
                            <div className="text-xs text-admin-gray-500">{r.orders} order{r.orders === 1 ? "" : "s"} · {r.unitsSoldAllTime} all time</div>
                          </td>
                        )}
                        {show("tg2-c-revenue") && <td className={cn(td, "whitespace-nowrap font-semibold text-admin-gray-900")}>{money(r.revenue)}</td>}
                        {show("tg2-c-status") && (
                          <td className={td}>
                            <StatusPill
                              label={`Change status of ${r.label}`}
                              value={r.status === "active" ? "active" : "inactive"}
                              options={TAG_STATUS}
                              disabled={isBusy}
                              onChange={(next) => setStatus(r, next)}
                            />
                          </td>
                        )}
                        {show("tg2-c-actions") && (
                          <td className={td}>
                            <div className="flex gap-[0.4rem]">
                              <IconAction tone="edit" onClick={() => setEditor({ tag: r, group: r.tagGroup })} title={`Edit ${r.label}`}><SquarePen /></IconAction>
                              <IconAction tone="delete" disabled={isBusy} onClick={() => remove(r, false)} title={`Delete ${r.label}`}><Trash2 /></IconAction>
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
            {pageCount > 1 && <Pager page={cur} pageCount={pageCount} onPage={setPage} label="Tag pages" />}
          </div>
        </section>
      )}

      {editor && (
        <TagEditor
          key={editor.tag?.id ?? `new-${editor.group}-${editor.label ?? ""}`}
          tag={editor.tag}
          group={editor.group}
          presetLabel={editor.label}
          onClose={() => setEditor(null)}
          onSaved={(msg) => { setEditor(null); setToast({ ok: true, text: msg }); router.refresh(); }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          danger
          busy={busy.has(confirmDelete.tag.id)}
          title={`Delete “${confirmDelete.tag.label}”?`}
          confirmLabel="Delete anyway"
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => remove(confirmDelete.tag, true)}
          body={<>{confirmDelete.used} product{confirmDelete.used === 1 ? "" : "s"} carry this tag. Deleting it moves {confirmDelete.used === 1 ? "that product" : "them"} to “no tag”. Nothing else about the products changes.</>}
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
const SWATCHES = ["#dc3545", "#e0a100", "#3d8b5f", "#2563eb", "#7c3aed", "#0f172a"];

function TagEditor({ tag, group: initialGroup, presetLabel, onClose, onSaved }: {
  tag: Tag2Row | null; group: TagGroup; presetLabel?: string; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [label, setLabel] = useState(tag?.label ?? presetLabel ?? "");
  const [group, setGroup] = useState<TagGroup>(tag?.tagGroup ?? initialGroup);
  const [color, setColor] = useState(tag?.color ?? "#2563eb");
  const [useColor, setUseColor] = useState(tag ? tag.color !== null : true);
  const [sortOrder, setSortOrder] = useState(String(tag?.sortOrder ?? 0));
  const [active, setActive] = useState(tag ? tag.status === "active" : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugify(label);
  const slugChanged = !!tag && slug !== tag.slug;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      label, slug, tagGroup: group,
      color: group === "badge" && useColor ? color : "",
      sortOrder: Number(sortOrder) || 0,
      status: active ? "active" : "inactive",
    };
    // The same rules the server applies, so most mistakes are caught before sending.
    const check = parseTagInput(payload);
    if (!check.ok) return setError(check.message);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(tag ? `/api/ecommerce/product-tags2/${tag.id}` : "/api/ecommerce/product-tags2", {
        method: tag ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || d.success !== true) {
        setError(d.message || "Could not save the tag. Please try again.");
        return;
      }
      onSaved(tag ? `“${label.trim()}” saved.` : `“${label.trim()}” added.`);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={tag ? `Edit ${tag.label}` : "Add Tag"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-4 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
          <button type="submit" form="tag-form" disabled={saving} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {tag ? "Save" : "Add Tag"}
          </button>
        </>
      }
    >
      <form id="tag-form" onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <span className={labelCls}>What is this?</span>
          <div className="inline-flex gap-1 rounded-[0.5rem] border border-admin-gray-200 bg-admin-gray-50 p-1" role="radiogroup" aria-label="Tag type">
            {([["badge", "Badge Tag"], ["item_type", "Item Type"]] as const).map(([k, text]) => (
              <button key={k} type="button" role="radio" aria-checked={group === k} onClick={() => { setGroup(k); setError(null); }}
                className={cn("rounded-[0.375rem] px-4 py-1.5 text-sm font-medium transition-colors", group === k ? "bg-white text-[#2563eb] shadow-sm" : "text-admin-gray-600 hover:text-admin-gray-900")}>
                {text}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-admin-gray-500">
            {group === "badge" ? "A badge is the little coloured label on the product card in the shop." : "An item type groups products for you; it isn't shown to customers."}
          </p>
        </div>

        <div>
          <label htmlFor="tg-label" className={labelCls}>Name</label>
          <input id="tg-label" autoFocus value={label} maxLength={50} onChange={(e) => { setLabel(e.target.value); setError(null); }} className={inputCls} placeholder="e.g. Best Seller" />
          {slug && <p className="mt-1 font-mono text-xs text-admin-gray-500">Code: {slug}</p>}
          {slugChanged && (
            <p className="mt-1 text-xs text-amber-700">The code changes, so every product using “{tag!.slug}” will be moved to “{slug}” automatically.</p>
          )}
        </div>

        {group === "badge" && (
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-admin-gray-800">
              <input type="checkbox" checked={useColor} onChange={(e) => setUseColor(e.target.checked)} className="h-4 w-4 accent-[#2563eb]" />
              Badge colour
            </label>
            {useColor && (
              <div className="flex flex-wrap items-center gap-2">
                <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setError(null); }} aria-label="Badge colour" className="h-10 w-14 cursor-pointer rounded-[0.375rem] border border-[#dee2e6] bg-white p-1" />
                {SWATCHES.map((s) => (
                  <button key={s} type="button" onClick={() => setColor(s)} aria-label={`Use ${s}`} style={{ background: s }}
                    className={cn("h-8 w-8 rounded-full border-2", color.toLowerCase() === s ? "border-admin-gray-900" : "border-white shadow")} />
                ))}
                <span className="ml-1 inline-flex h-8 items-center rounded-[0.25rem] px-3 text-xs font-semibold text-white" style={{ background: color }}>
                  {label.trim() || "Preview"}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tg-order" className={labelCls}>Display order</label>
            <input id="tg-order" inputMode="numeric" value={sortOrder} onChange={(e) => { setSortOrder(e.target.value.replace(/\D/g, "")); setError(null); }} className={inputCls} />
            <p className="mt-1 text-xs text-admin-gray-500">Smaller numbers come first.</p>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-admin-gray-700">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#2563eb]" />
              Active
            </label>
          </div>
        </div>

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
        <div className="text-sm text-admin-gray-700">Sales shown for: <b className="text-admin-gray-900">{showing}</b></div>
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
      <p className="mt-2 text-xs text-admin-gray-500">Product counts are always current; only the sales figures follow these dates.</p>
    </section>
  );
}
