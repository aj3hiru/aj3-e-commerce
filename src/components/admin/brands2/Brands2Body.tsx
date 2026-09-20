"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Tags, BadgeCheck, Star, PackageOpen, CircleDot, ImageIcon, Boxes, ChevronDown, ChevronLeft, ChevronRight, Download,
  Plus, SquarePen, Trash2, Loader2, CheckCircle2, AlertCircle, X, Layers, ArrowUp, ArrowDown, ChevronsUpDown, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";

/* ───────────────────────── types ───────────────────────── */

export interface Brand2Row {
  id: number;
  name: string;
  slug: string;
  logo: string | null;
  isPopular: boolean;
  status: string; // "active" | "inactive"
  products: number;
}

type SortKey = "name" | "slug" | "products";
interface Filters { status: "all" | "active" | "inactive"; popular: "all" | "yes" | "no"; logo: "all" | "yes" | "no"; products: "all" | "yes" | "no" }
const NO_FILTERS: Filters = { status: "all", popular: "all", logo: "all", products: "all" };

/** Header buttons (in the AdminShell header) talk to the body through these events. */
const EVT_ADD = "brands2:add";
const EVT_EXPORT = "brands2:export";

/* ───────────────────────── header controls ───────────────────────── */

export function Brands2HeaderButtons() {
  return (
    <>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(EVT_EXPORT))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]"
      >
        <Download className="h-4 w-4" /> Export
      </button>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(EVT_ADD))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-[#2563eb] px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]"
      >
        <Plus className="h-4 w-4" /> Add Brand
      </button>
    </>
  );
}

/* ───────────────────────── body ───────────────────────── */

const ROW_H = 72;
const HEAD_H = 50;
const MIN_ROWS = 6;

export function Brands2Body({ brands: initial }: { brands: Brand2Row[] }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();

  const [brands, setBrands] = useState(initial);
  useEffect(() => setBrands(initial), [initial]);

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Brand2Row | "new" | null>(null);
  const [confirm, setConfirm] = useState<Brand2Row[] | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => ({
    total: brands.length,
    enabled: brands.filter((b) => b.status === "active").length,
    popular: brands.filter((b) => b.isPopular).length,
    unused: brands.filter((b) => b.products === 0).length,
  }), [brands]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = brands.filter((b) => {
      if (filters.status !== "all" && b.status !== filters.status) return false;
      if (filters.popular !== "all" && b.isPopular !== (filters.popular === "yes")) return false;
      if (filters.logo !== "all" && !!b.logo !== (filters.logo === "yes")) return false;
      if (filters.products !== "all" && b.products > 0 !== (filters.products === "yes")) return false;
      if (term && !`${b.name} ${b.slug}`.toLowerCase().includes(term)) return false;
      return true;
    });
    if (!sort) return list; // newest first, as the server sends it
    const v = (b: Brand2Row) => (sort.key === "products" ? b.products : b[sort.key].toLowerCase());
    return [...list].sort((a, b) => {
      const c = v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : b.id - a.id;
      return sort.dir === "asc" ? c : -c;
    });
  }, [brands, filters, q, sort]);

  useEffect(() => setPage(1), [filters, q, sort, pageSize]);
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(brands.map((b) => b.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [brands]);

  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = pageSize === 0 ? 0 : (current - 1) * pageSize;
  const rows = pageSize === 0 ? filtered : filtered.slice(start, start + pageSize);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS) || search.trim() !== "";

  // Header buttons.
  const exportRef = useRef<() => void>(() => {});
  exportRef.current = () => exportCsv(filtered);
  useEffect(() => {
    const onAdd = () => setEditing("new");
    const onExport = () => exportRef.current();
    window.addEventListener(EVT_ADD, onAdd);
    window.addEventListener(EVT_EXPORT, onExport);
    return () => {
      window.removeEventListener(EVT_ADD, onAdd);
      window.removeEventListener(EVT_EXPORT, onExport);
    };
  }, []);

  function exportCsv(list: Brand2Row[]) {
    const cell = (v: string | number) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [["ID", "Name", "Slug", "Products", "Status", "Popular", "Logo"].join(",")];
    for (const b of list) lines.push([b.id, b.name, b.slug, b.products, b.status === "active" ? "Enabled" : "Disabled", b.isPopular ? "Yes" : "No", b.logo ?? ""].map(cell).join(","));
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `brands-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const markBusy = (ids: number[], on: boolean) =>
    setBusy((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  /** Quick change (status / popular) for one or many brands; shows at once, undone if the server says no. */
  async function patch(ids: number[], change: { status?: "active" | "inactive"; isPopular?: boolean }, label: string) {
    const todo = ids.filter((id) => {
      const b = brands.find((x) => x.id === id);
      return b && ((change.status && b.status !== change.status) || (change.isPopular !== undefined && b.isPopular !== change.isPopular));
    });
    if (!todo.length) return setToast({ ok: true, text: "Nothing to change." });
    const before = new Map(brands.filter((b) => todo.includes(b.id)).map((b) => [b.id, b]));
    setBrands((list) => list.map((b) => (todo.includes(b.id) ? { ...b, ...change } : b)));
    markBusy(todo, true);
    const failed: number[] = [];
    for (let i = 0; i < todo.length; i += 4) {
      const chunk = todo.slice(i, i + 4);
      const res = await Promise.all(chunk.map((id) =>
        fetch(`/api/ecommerce/brands2/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) })
          .then(async (r) => r.ok && (await r.json().catch(() => ({}))).success === true)
          .catch(() => false)
      ));
      res.forEach((ok, j) => !ok && failed.push(chunk[j]));
    }
    markBusy(todo, false);
    if (failed.length) setBrands((list) => list.map((b) => (failed.includes(b.id) ? before.get(b.id)! : b)));
    const done = todo.length - failed.length;
    setToast(failed.length
      ? { ok: false, text: todo.length === 1 ? "Couldn't save the change. Please try again." : `${done} updated, ${failed.length} failed. Please try again.` }
      : { ok: true, text: todo.length === 1 ? `“${before.get(todo[0])!.name}” ${label}.` : `${done} brands ${label}.` });
    router.refresh();
  }

  async function remove(list: Brand2Row[], detach: boolean) {
    setConfirm(null);
    const ids = list.map((b) => b.id);
    markBusy(ids, true);
    const ok: number[] = [];
    const failed: string[] = [];
    for (const b of list) {
      const res = await fetch(`/api/ecommerce/brands2/${b.id}${detach ? "?detach=1" : ""}`, { method: "DELETE" })
        .then(async (r) => r.ok && (await r.json().catch(() => ({}))).success === true)
        .catch(() => false);
      if (res) ok.push(b.id);
      else failed.push(b.name);
    }
    markBusy(ids, false);
    if (ok.length) setBrands((l) => l.filter((b) => !ok.includes(b.id)));
    setToast(failed.length
      ? { ok: false, text: `${ok.length ? `${ok.length} deleted. ` : ""}Couldn't delete ${failed.slice(0, 2).map((n) => `“${n}”`).join(", ")}${failed.length > 2 ? ` and ${failed.length - 2} more` : ""}.` }
      : { ok: true, text: ok.length === 1 ? `“${list[0].name}” deleted.` : `${ok.length} brands deleted.` });
    router.refresh();
  }

  function toggleSort(k: SortKey) {
    setSort((s) => (!s || s.key !== k ? { key: k, dir: k === "products" ? "desc" : "asc" } : { key: k, dir: s.dir === "asc" ? "desc" : "asc" }));
  }
  function toggleSel(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const pageAll = rows.length > 0 && rows.every((b) => selected.has(b.id));
  const selRows = brands.filter((b) => selected.has(b.id));
  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  // Columns (Display Options).
  // Narrower fixed columns under 1500px so Name keeps room on laptops.
  const COLS: { key: string; label: string; width?: string; sort?: SortKey }[] = [
    { key: "b2-c-select", label: "", width: "w-[44px] min-[1500px]:w-[52px]" },
    { key: "b2-c-name", label: "Name", sort: "name" },
    { key: "b2-c-logo", label: "Logo", width: "w-[88px] min-[1500px]:w-[130px]" },
    { key: "b2-c-slug", label: "Slug", width: "w-[124px] min-[1500px]:w-[22%]", sort: "slug" },
    { key: "b2-c-products", label: "Products", width: "w-[114px] min-[1500px]:w-[150px]", sort: "products" },
    { key: "b2-c-status", label: "Status", width: "w-[142px] min-[1500px]:w-[160px]" },
    { key: "b2-c-popular", label: "Popular", width: "w-[142px] min-[1500px]:w-[160px]" },
    { key: "b2-c-actions", label: "Actions", width: "w-[116px] min-[1500px]:w-[130px]" },
  ];
  const cols = COLS.filter((c) => show("b2-table") && show(c.key));
  const cardKeys = ["b2-k-total", "b2-k-enabled", "b2-k-popular", "b2-k-unused"].filter(show);
  const filterKeys = ["b2-f-status", "b2-f-popular", "b2-f-logo", "b2-f-products"].filter(show);
  const td = "border border-[#dee2e6] px-3 align-middle";

  return (
    <div className={cn("space-y-5", !loaded && "invisible")}>
      {/* ── summary cards ── */}
      {show("b2-cards") && cardKeys.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {show("b2-k-total") && <StatCard icon={Tags} tint="bg-violet-50 text-violet-600" value={stats.total} label="Total Brands" active={!filtersActive} onClick={() => { setFilters(NO_FILTERS); setSearch(""); }} />}
          {show("b2-k-enabled") && <StatCard icon={BadgeCheck} tint="bg-emerald-50 text-emerald-600" value={stats.enabled} label="Enabled" active={filters.status === "active"} onClick={() => setF("status", filters.status === "active" ? "all" : "active")} />}
          {show("b2-k-popular") && <StatCard icon={Star} tint="bg-amber-50 text-amber-500" value={stats.popular} label="Popular" active={filters.popular === "yes"} onClick={() => setF("popular", filters.popular === "yes" ? "all" : "yes")} />}
          {show("b2-k-unused") && <StatCard icon={PackageOpen} tint="bg-slate-100 text-slate-500" value={stats.unused} label="No Products" active={filters.products === "no"} onClick={() => setF("products", filters.products === "no" ? "all" : "no")} />}
        </div>
      )}

      {/* ── filters (live) ── */}
      {show("b2-filters") && filterKeys.length > 0 && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {show("b2-f-status") && (
              <FilterSelect icon={CircleDot} label="Status" value={filters.status} onChange={(v) => setF("status", v as Filters["status"])}
                dot={filters.status === "active" ? "bg-emerald-500" : filters.status === "inactive" ? "bg-slate-400" : undefined}>
                <option value="all">All Status</option><option value="active">Enabled</option><option value="inactive">Disabled</option>
              </FilterSelect>
            )}
            {show("b2-f-popular") && (
              <FilterSelect icon={Star} label="Popular" value={filters.popular} onChange={(v) => setF("popular", v as Filters["popular"])}>
                <option value="all">All Brands</option><option value="yes">Popular</option><option value="no">Not Popular</option>
              </FilterSelect>
            )}
            {show("b2-f-logo") && (
              <FilterSelect icon={ImageIcon} label="Logo" value={filters.logo} onChange={(v) => setF("logo", v as Filters["logo"])}>
                <option value="all">Any Logo</option><option value="yes">With Logo</option><option value="no">No Logo</option>
              </FilterSelect>
            )}
            {show("b2-f-products") && (
              <FilterSelect icon={Boxes} label="Products" value={filters.products} onChange={(v) => setF("products", v as Filters["products"])}>
                <option value="all">All</option><option value="yes">Has Products</option><option value="no">No Products</option>
              </FilterSelect>
            )}
          </div>
        </section>
      )}

      {/* ── brands table: the "sheet" look from the current Brands page ── */}
      {show("b2-table") && (
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

            {show("b2-c-select") && (
              <>
                <Menu
                  disabled={selected.size === 0}
                  trigger={(open) => (
                    <span className={cn("flex h-10 items-center gap-2 rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 text-sm font-medium", selected.size === 0 ? "text-admin-gray-400" : "text-admin-gray-800 hover:bg-admin-gray-50")}>
                      <Layers className="h-4 w-4" /> Bulk Actions{selected.size ? ` (${selected.size})` : ""} <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                    </span>
                  )}
                  items={[
                    { label: "Enable", onClick: () => patch([...selected], { status: "active" }, "enabled") },
                    { label: "Disable", onClick: () => patch([...selected], { status: "inactive" }, "disabled") },
                    { label: "Mark Popular", onClick: () => patch([...selected], { isPopular: true }, "marked popular") },
                    { label: "Remove Popular", onClick: () => patch([...selected], { isPopular: false }, "no longer popular") },
                    { label: "Export selected (CSV)", onClick: () => exportCsv(selRows) },
                    { label: "Delete", danger: true, onClick: () => setConfirm(selRows) },
                  ]}
                />
                {selected.size > 0 && <button type="button" onClick={() => setSelected(new Set())} className="text-[13px] text-admin-gray-500 hover:underline">Clear selection</button>}
              </>
            )}

            {filtersActive && (
              <button type="button" onClick={() => { setFilters(NO_FILTERS); setSearch(""); }} className="flex items-center gap-1 text-[13px] font-medium text-[#2563eb] hover:underline">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}

            {show("b2-t-search") && (
              <label className="ml-auto flex items-center gap-2">
                Search:
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search brands"
                  className="h-10 w-[220px] rounded-[0.375rem] border border-[#dee2e6] px-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
              </label>
            )}
          </div>

          {cols.length === 0 ? (
            <p className="py-10 text-center text-sm text-admin-gray-400">All table columns are hidden — turn them on from Display Options.</p>
          ) : (
            <div className="overflow-x-auto" style={{ minHeight: pageSize === 0 ? undefined : HEAD_H + Math.min(pageSize, MIN_ROWS) * ROW_H }}>
              <table className="w-full min-w-[880px] table-fixed border-collapse text-[15px]">
                <colgroup>{cols.map((c) => <col key={c.key} className={c.width} />)}</colgroup>
                <thead>
                  <tr className="bg-[#f8f9fa] text-left" style={{ height: HEAD_H }}>
                    {cols.map((c) =>
                      c.key === "b2-c-select" ? (
                        <th key={c.key} className={cn(td, "text-center")}>
                          <input type="checkbox" checked={pageAll} aria-label="Select brands on this page" className="h-4 w-4 accent-[#2563eb]"
                            onChange={(e) => setSelected((s) => { const n = new Set(s); rows.forEach((b) => (e.target.checked ? n.add(b.id) : n.delete(b.id))); return n; })} />
                        </th>
                      ) : (
                        <th key={c.key} className={cn(td, "font-bold text-admin-gray-900")} aria-sort={c.sort && sort?.key === c.sort ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                          {c.sort ? (
                            <button type="button" onClick={() => toggleSort(c.sort!)} className="flex w-full items-center justify-between gap-2 font-bold">
                              {c.label}
                              {sort?.key === c.sort
                                ? sort.dir === "asc" ? <ArrowUp className="h-4 w-4 text-admin-gray-600" /> : <ArrowDown className="h-4 w-4 text-admin-gray-600" />
                                : <ChevronsUpDown className="h-4 w-4 text-admin-gray-300" />}
                            </button>
                          ) : c.label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={cols.length} className={cn(td, "py-12 text-center text-admin-gray-400")}>
                      {brands.length === 0 ? <>No brands yet. <button type="button" onClick={() => setEditing("new")} className="font-semibold text-[#2563eb] hover:underline">Add your first brand</button></> : "No brands match these filters."}
                    </td></tr>
                  ) : rows.map((b) => {
                    const isBusy = busy.has(b.id);
                    return (
                      <tr key={b.id} style={{ height: ROW_H }} className={cn(selected.has(b.id) ? "bg-blue-50/60" : "odd:bg-[#f2f2f2] even:bg-white", isBusy && "opacity-60")}>
                        {show("b2-c-select") && (
                          <td className={cn(td, "text-center")}>
                            <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleSel(b.id)} aria-label={`Select ${b.name}`} className="h-4 w-4 accent-[#2563eb]" />
                          </td>
                        )}
                        {show("b2-c-name") && (
                          <td className={td}>
                            <button type="button" onClick={() => setEditing(b)} title={`Edit ${b.name}`} className="block max-w-full truncate text-left text-admin-gray-900 hover:text-[#2563eb] hover:underline">
                              {b.name}
                            </button>
                          </td>
                        )}
                        {show("b2-c-logo") && <td className={td}><Logo src={b.logo} name={b.name} size={56} /></td>}
                        {show("b2-c-slug") && <td className={cn(td, "truncate")} title={b.slug}>{b.slug}</td>}
                        {show("b2-c-products") && (
                          <td className={td}>
                            {b.products > 0 ? (
                              <a href={`/admin/ecommerce/products2?q=${encodeURIComponent(b.name)}`} title="See these products" className="hover:text-[#2563eb] hover:underline">{b.products.toLocaleString("en-IN")}</a>
                            ) : <span>0</span>}
                          </td>
                        )}
                        {show("b2-c-status") && (
                          <td className={td}>
                            <PillMenu on={b.status === "active"} busy={isBusy} labels={["Enabled", "Disabled"]} name={`Status of ${b.name}`}
                              onChange={(on) => patch([b.id], { status: on ? "active" : "inactive" }, on ? "enabled" : "disabled")} />
                          </td>
                        )}
                        {show("b2-c-popular") && (
                          <td className={td}>
                            <PillMenu on={b.isPopular} busy={isBusy} labels={["Enabled", "Disabled"]} name={`Popular for ${b.name}`}
                              onChange={(on) => patch([b.id], { isPopular: on }, on ? "marked popular" : "no longer popular")} />
                          </td>
                        )}
                        {show("b2-c-actions") && (
                          <td className={td}>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setEditing(b)} aria-label={`Edit ${b.name}`} title="Edit"
                                className="flex h-10 w-10 items-center justify-center rounded-[0.375rem] bg-[#4361ee] text-white shadow-sm hover:bg-[#3651d4]">
                                <SquarePen className="h-4 w-4" />
                              </button>
                              <button type="button" disabled={isBusy} onClick={() => setConfirm([b])} aria-label={`Delete ${b.name}`} title="Delete"
                                className="flex h-10 w-10 items-center justify-center rounded-[0.375rem] bg-[#e5534b] text-white shadow-sm hover:bg-[#d63f37] disabled:opacity-50">
                                <Trash2 className="h-4 w-4" />
                              </button>
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

          <div className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-3 text-[15px] text-admin-gray-800">
            <span>
              {filtered.length === 0 ? "Showing 0 entries" : `Showing ${start + 1} to ${start + rows.length} of ${filtered.length} entries`}
              {filtered.length !== brands.length && <span className="text-admin-gray-500"> (filtered from {brands.length} total entries)</span>}
            </span>
            {pageCount > 1 && <Pager page={current} pageCount={pageCount} onPage={setPage} />}
          </div>
        </section>
      )}

      {editing && (
        <BrandModal
          brand={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(name, isNew) => {
            setEditing(null);
            setToast({ ok: true, text: `“${name}” ${isNew ? "added" : "saved"}.` });
            router.refresh();
          }}
          onDelete={editing === "new" ? undefined : () => { const b = editing; setEditing(null); setConfirm([b]); }}
        />
      )}
      {confirm && <ConfirmDelete list={confirm} onCancel={() => setConfirm(null)} onConfirm={(detach) => remove(confirm, detach)} />}
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

/* ───────────────────────── pieces ───────────────────────── */

/** Logo tile — falls back to the placeholder when there's no logo or the file is missing. */
function Logo({ src, name, size = 64 }: { src: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A missing file can fail before the page is interactive (onError is missed),
  // so also check once mounted.
  useEffect(() => {
    const el = img.current;
    setBroken(!!el && el.complete && el.naturalWidth === 0);
  }, [src]);
  const box = { width: size, height: size };
  if (!src || broken) {
    return (
      <span style={box} className="flex items-center justify-center rounded-[0.375rem] bg-admin-gray-100 text-admin-gray-400" title={src ? "Logo file is missing" : "No logo"}>
        <ImageIcon className="h-5 w-5" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src.startsWith("http") || src.startsWith("blob:") ? src : `/${src}`} ref={img} alt="" title={`${name} logo`} style={box} onError={() => setBroken(true)} className="rounded-[0.375rem] border border-admin-gray-200 bg-white object-contain p-1" />;
}

function StatCard({ icon: Icon, tint, value, label, active, onClick }: {
  icon: React.ComponentType<{ className?: string }>; tint: string; value: number; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={`Show ${label.toLowerCase()}`}
      className={cn("flex items-center gap-4 rounded-xl border bg-white px-5 py-4 text-left shadow-sm transition-colors", active ? "border-[#2563eb]/40 ring-1 ring-[#2563eb]/25" : "border-admin-gray-200 hover:border-[#2563eb]/30")}>
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tint)}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-tight text-admin-gray-900">{value.toLocaleString("en-IN")}</span>
        <span className="block text-sm text-admin-gray-600">{label}</span>
      </span>
    </button>
  );
}

function FilterSelect({ icon: Icon, label, value, onChange, dot, children }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; onChange: (v: string) => void; dot?: string; children: React.ReactNode;
}) {
  const on = value !== "all";
  return (
    <label className={cn("relative flex h-12 min-w-[180px] flex-1 cursor-pointer items-center gap-2.5 rounded-[0.5rem] border pl-3 pr-9 transition-colors focus-within:ring-2 focus-within:ring-[#2563eb]/15",
      on ? "border-[#2563eb]/40 bg-blue-50/50" : "border-admin-gray-200 bg-white hover:border-admin-gray-300")}>
      <Icon className={cn("h-4 w-4 shrink-0", on ? "text-[#2563eb]" : "text-admin-gray-500")} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs leading-4 text-admin-gray-500">{label}</span>
        <span className="flex items-center gap-1.5">
          {dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />}
          <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
            className="w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent text-sm font-medium leading-5 text-admin-gray-900 focus:outline-none">
            {children}
          </select>
        </span>
      </span>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-500" />
    </label>
  );
}

/** The green "Enabled ▾" / grey "Disabled ▾" button from the current page; menu portalled so the table can't clip it. */
function PillMenu({ on, busy, labels, name, onChange }: { on: boolean; busy: boolean; labels: [string, string]; name: string; onChange: (on: boolean) => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDoc = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !menu.current?.contains(t)) close(); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);
  return (
    <>
      <button ref={btn} type="button" disabled={busy} aria-haspopup="menu" aria-expanded={!!pos} aria-label={`${name}: ${on ? labels[0] : labels[1]}`}
        onClick={() => {
          if (pos) return setPos(null);
          const r = btn.current!.getBoundingClientRect();
          setPos({ top: r.bottom + 4 + 84 > window.innerHeight ? r.top - 88 : r.bottom + 4, left: r.left });
        }}
        className={cn("inline-flex h-10 items-center gap-2 rounded-[0.25rem] px-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors disabled:cursor-wait",
          on ? "bg-[#5cc28a] hover:bg-[#4bb279]" : "bg-[#8a8f98] hover:bg-[#777c85]")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : on ? labels[0] : labels[1]}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {pos && createPortal(
        <div ref={menu} role="menu" className="fixed z-[400] w-[150px] rounded-[0.375rem] border border-admin-gray-200 bg-white py-1 text-sm shadow-lg" style={pos}>
          {[true, false].map((v) => (
            <button key={String(v)} type="button" role="menuitemradio" aria-checked={on === v}
              onClick={() => { setPos(null); if (v !== on) onChange(v); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-admin-gray-50">
              <span className={cn("h-2 w-2 rounded-full", v ? "bg-[#5cc28a]" : "bg-[#8a8f98]")} />
              {v ? labels[0] : labels[1]}
              {on === v && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-500" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function Menu({ trigger, items, disabled }: { trigger: (open: boolean) => React.ReactNode; disabled?: boolean; items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={disabled ? "Select brands first" : undefined} className="block disabled:cursor-not-allowed">
        {trigger(open)}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1.5 min-w-[210px] rounded-[0.5rem] border border-admin-gray-200 bg-white py-1 text-sm shadow-lg">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}
              className={cn("block w-full px-3.5 py-2 text-left hover:bg-admin-gray-50", it.danger ? "text-red-600" : "text-admin-gray-800")}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** DataTables-style pager: Previous · 1 2 3 · Next */
function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = "flex h-10 min-w-10 items-center justify-center border border-[#dee2e6] px-3 text-sm -ml-px first:ml-0 first:rounded-l-[0.375rem] last:rounded-r-[0.375rem]";
  return (
    <nav className="flex" aria-label="Brand pages">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={cn(btn, "gap-1 text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300 disabled:hover:bg-transparent")}><ChevronLeft className="h-4 w-4" /> Previous</button>
      {nums.map((n, i) => n === "…"
        ? <span key={`e${i}`} className={cn(btn, "text-admin-gray-400")}>…</span>
        : <button key={n} type="button" aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}
            className={cn(btn, n === page ? "relative z-10 border-[#2563eb] bg-[#2563eb] text-white" : "text-[#2563eb] hover:bg-admin-gray-50")}>{n}</button>)}
      <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)} className={cn(btn, "gap-1 text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300 disabled:hover:bg-transparent")}>Next <ChevronRight className="h-4 w-4" /></button>
    </nav>
  );
}

/** Add / Edit Brand — the brand's "profile": name, slug, logo, status, popular. */
function BrandModal({ brand, onClose, onSaved, onDelete }: {
  brand: Brand2Row | null;
  onClose: () => void;
  onSaved: (name: string, isNew: boolean) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(brand?.name ?? "");
  const [slug, setSlug] = useState(brand?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!brand);
  const [status, setStatus] = useState(brand?.status === "inactive" ? "inactive" : "active");
  const [popular, setPopular] = useState(brand?.isPopular ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const current = preview ?? (removeLogo ? null : brand?.logo ?? null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr({ text: "Brand name is required.", field: "name" });
    if (file && (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024)) return setErr({ text: "The logo must be an image up to 2 MB.", field: "logo" });
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("slug", slug.trim());
    fd.set("status", status);
    fd.set("is_popular", popular ? "1" : "0");
    if (file) fd.set("logo", file);
    if (removeLogo && !file) fd.set("remove_logo", "1");
    try {
      const res = await fetch(brand ? `/api/ecommerce/brands2/${brand.id}` : "/api/ecommerce/brands2", { method: brand ? "PUT" : "POST", body: fd });
      const data = await res.json().catch(() => ({ success: false, message: "Unexpected server response." }));
      if (!data.success) {
        setErr({ text: data.message || "Could not save the brand.", field: data.field });
        setBusy(false);
        return;
      }
      onSaved(data.name, !brand);
    } catch {
      setErr({ text: "Could not reach the server. Please try again." });
      setBusy(false);
    }
  }

  const inputCls = (bad: boolean) => cn("h-11 w-full rounded-[0.375rem] border px-3 text-[15px] outline-none transition-[border-color,box-shadow]",
    bad ? "border-red-400 focus:ring-4 focus:ring-red-100" : "border-[#dee2e6] focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15");

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <form onSubmit={save} role="dialog" aria-modal="true" aria-label={brand ? "Edit Brand" : "Add New Brand"} noValidate
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#dee2e6] bg-[#f8f9fa] px-6 py-4">
          <h5 className="text-xl font-semibold text-admin-gray-900">{brand ? "Edit Brand" : "Add New Brand"}</h5>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-admin-gray-500 hover:bg-admin-gray-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {brand && (
            <div className="flex items-center gap-3 rounded-[0.5rem] border border-[#dee2e6] bg-[#f8f9fa] px-3 py-2.5 text-sm text-admin-gray-700">
              <Logo src={current} name={name || brand.name} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-admin-gray-900">{brand.name}</span>
                <span className="block text-xs text-admin-gray-500">{brand.products.toLocaleString("en-IN")} product{brand.products === 1 ? "" : "s"} · ID #{brand.id}</span>
              </span>
              {brand.products > 0 && <a href={`/admin/ecommerce/products2?q=${encodeURIComponent(brand.name)}`} className="text-xs font-medium text-[#2563eb] hover:underline">View products</a>}
            </div>
          )}
          {err && <div role="alert" className="rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err.text}</div>}
          <div>
            <label htmlFor="b2-name" className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Brand Name</label>
            <input id="b2-name" autoFocus value={name} maxLength={100} placeholder="e.g. Nike"
              onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(toSlug(e.target.value)); if (err?.field === "name") setErr(null); }}
              className={inputCls(err?.field === "name")} />
          </div>
          <div>
            <label htmlFor="b2-slug" className="mb-1.5 flex items-baseline justify-between text-[15px] font-medium text-admin-gray-900">
              Slug <span className="text-xs font-normal text-admin-gray-400">Made from the name automatically</span>
            </label>
            <input id="b2-slug" value={slug} maxLength={120} placeholder="auto-generated"
              onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")); setSlugTouched(e.target.value !== ""); }}
              className={inputCls(false)} />
          </div>
          <div>
            <span className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Logo <span className="text-sm font-normal text-admin-gray-500">(optional)</span></span>
            <div className="flex items-center gap-3">
              {current ? <Logo src={current} name={name} size={64} /> : (
                <button type="button" onClick={() => input.current?.click()} className="flex h-16 w-16 items-center justify-center rounded-[0.375rem] border-2 border-dashed border-[#dee2e6] text-admin-gray-400 hover:border-[#2563eb] hover:text-[#2563eb]" aria-label="Choose logo">
                  <Upload className="h-5 w-5" />
                </button>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => input.current?.click()} className="h-9 rounded-[0.375rem] border border-[#dee2e6] bg-[#f8f9fa] px-3 text-sm font-medium text-admin-gray-800 hover:bg-admin-gray-100">
                  {current ? "Change" : "Choose file"}
                </button>
                {current && (
                  <button type="button" onClick={() => { if (file) setFile(null); else setRemoveLogo(true); }} className="h-9 rounded-[0.375rem] px-2 text-sm font-medium text-red-600 hover:bg-red-50">Remove</button>
                )}
                {removeLogo && !file && brand?.logo && <button type="button" onClick={() => setRemoveLogo(false)} className="h-9 px-2 text-sm text-[#2563eb] hover:underline">Undo</button>}
              </div>
              <input ref={input} type="file" accept="image/*" className="sr-only" aria-label="Brand logo"
                onClick={(e) => ((e.target as HTMLInputElement).value = "")}
                onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) setRemoveLogo(false); }} />
            </div>
            <p className="mt-1.5 text-xs text-admin-gray-400">{file ? file.name : "JPG, PNG, WebP or SVG · up to 2 MB"}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle label="Status" on={status === "active"} onLabel="Enabled" offLabel="Disabled" onChange={(v) => setStatus(v ? "active" : "inactive")} />
            <Toggle label="Popular brand" on={popular} onLabel="Yes" offLabel="No" onChange={setPopular} />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-[#dee2e6] px-6 py-4">
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={busy} className="mr-auto flex h-10 items-center gap-1.5 rounded-[0.375rem] px-3 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
          <button type="button" onClick={onClose} disabled={busy} className={cn("h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-[15px] font-medium text-white hover:bg-[#5c636a]", !onDelete && "ml-auto")}>Cancel</button>
          <button type="submit" disabled={busy} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-[15px] font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {brand ? "Save Changes" : "Add Brand"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

function Toggle({ label, on, onLabel, offLabel, onChange }: { label: string; on: boolean; onLabel: string; offLabel: string; onChange: (v: boolean) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">{label}</span>
      <div className="grid grid-cols-2 rounded-[0.375rem] border border-[#dee2e6] p-1" role="group" aria-label={label}>
        {[true, false].map((v) => (
          <button key={String(v)} type="button" aria-pressed={on === v} onClick={() => onChange(v)}
            className={cn("h-8 rounded-[0.25rem] text-sm font-medium transition-colors", on === v ? (v ? "bg-[#5cc28a] text-white" : "bg-[#8a8f98] text-white") : "text-admin-gray-600 hover:bg-admin-gray-50")}>
            {v ? onLabel : offLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConfirmDelete({ list, onCancel, onConfirm }: { list: Brand2Row[]; onCancel: () => void; onConfirm: (detach: boolean) => void }) {
  const used = list.reduce((s, b) => s + b.products, 0);
  const [detach, setDetach] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const what = list.length === 1 ? `“${list[0].name}”` : `${list.length} brands`;
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-label="Delete brand" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h5 className="mb-2 flex items-center gap-2 text-lg font-bold text-admin-gray-900"><Trash2 className="h-5 w-5 text-red-500" /> Delete {what}?</h5>
        <p className="text-sm text-admin-gray-600">This can&apos;t be undone.</p>
        {used > 0 && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-[0.5rem] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" checked={detach} onChange={(e) => setDetach(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600" />
            <span>
              <b>{used.toLocaleString("en-IN")} product{used === 1 ? " uses" : "s use"}</b> {list.length === 1 ? "this brand" : "these brands"}.
              Tick to remove the brand from {used === 1 ? "it" : "them"} and delete — the products themselves stay.
            </span>
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
          <button type="button" autoFocus disabled={used > 0 && !detach} onClick={() => onConfirm(used > 0)}
            className="h-10 rounded-[0.375rem] bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
