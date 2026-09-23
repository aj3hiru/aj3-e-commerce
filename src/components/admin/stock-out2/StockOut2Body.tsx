"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  PackageX, BadgeCheck, EyeOff, Layers, CircleDot, FolderTree, Boxes, ImageIcon, ChevronDown, ChevronLeft, ChevronRight,
  Download, SquarePen, PackagePlus, Loader2, CheckCircle2, AlertCircle, X, ArrowUp, ArrowDown, ChevronsUpDown, PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { ActionMenu, IconAction, PillButton, StatusPill, type PillOption } from "@/components/admin/ui/buttons";

const PRODUCT_STATUS: readonly PillOption<"active" | "inactive">[] = [
  { value: "active", label: "Active", variant: "success" },
  { value: "inactive", label: "Inactive", variant: "secondary" },
];

/* ───────────────────────── types & helpers ───────────────────────── */

/** One Size / Unit of a product (e.g. 250 g, 500 g) with its own optional stock. */
export interface StockOut2Size {
  id: number;
  label: string;
  mrp: number;
  price: number | null;
  stockQty: number | null; // null = this unit's stock isn't tracked
  isDefault: boolean;
}

export interface StockOut2Row {
  id: number;
  name: string;
  image: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  salePrice: number | null;
  status: string; // "active" | "inactive"
  stockQty: number | null; // null = stock not set
  unit: string | null;
  categoryId: number | null;
  categoryName: string | null;
  brandName: string | null;
  sizes: StockOut2Size[];
}

type SortKey = "name" | "category" | "price" | "status";

interface Filters {
  status: "all" | "active" | "inactive";
  category: string; // "all" | "none" | category id
  units: "all" | "yes" | "no";
  stock: "all" | "zero" | "unset";
}
const NO_FILTERS: Filters = { status: "all", category: "all", units: "all", stock: "all" };

/** Header buttons (in the AdminShell header) talk to the body through this event. */
const EVT_EXPORT = "stockout2:export";

const EDIT_HREF = (id: number) => `/admin/ecommerce/products/add?edit=${id}&from=stock-out-products2`;

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hasSale = (p: StockOut2Row) => p.salePrice !== null && p.salePrice > 0 && p.salePrice < p.price;
const effectivePrice = (p: StockOut2Row) => (hasSale(p) ? (p.salePrice as number) : p.price);
const stockLabel = (p: StockOut2Row) => (p.stockQty === null ? "Not set" : `${p.stockQty.toLocaleString("en-IN")}${p.unit ? ` ${p.unit}` : ""} in stock`);
const unitsWord = (n: number) => `${n} unit${n === 1 ? "" : "s"}`;

/* ───────────────────────── header controls ───────────────────────── */

export function StockOut2HeaderButtons() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVT_EXPORT))}
      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]"
    >
      <Download className="h-4 w-4" /> Export
    </button>
  );
}

/* ───────────────────────── body ───────────────────────── */

/** Row and header heights (px). Fixed, so filtering never makes the table jump. */
const ROW_H = 76;
const HEAD_H = 50;
const MIN_ROWS = 6;

export function StockOut2Body({ products: initial, notice }: { products: StockOut2Row[]; notice?: string | null }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();

  // Local copy so a restock or status change shows straight away; replaced
  // whenever the server sends a fresh list (router.refresh after a change).
  const [products, setProducts] = useState(initial);
  useEffect(() => setProducts(initial), [initial]);

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [pageSize, setPageSize] = useState(10); // 0 = All
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [editor, setEditor] = useState<{ id: number; anchor: HTMLElement } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(notice ? { ok: true, text: notice } : null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const stats = useMemo(
    () => ({
      total: products.length,
      active: products.filter((p) => p.status === "active").length,
      inactive: products.filter((p) => p.status !== "active").length,
      withUnits: products.filter((p) => p.sizes.length > 0).length,
    }),
    [products]
  );

  // Category filter options come from the products on this page, so they're never stale or empty.
  const categories = useMemo(() => {
    const m = new Map<number, string>();
    let uncategorized = false;
    for (const p of products) {
      if (p.categoryId === null) uncategorized = true;
      else if (p.categoryName) m.set(p.categoryId, p.categoryName);
    }
    return { list: [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), uncategorized };
  }, [products]);

  // If the chosen category has no products left (they were restocked), drop the filter.
  useEffect(() => {
    if (filters.category === "all") return;
    const exists = filters.category === "none" ? categories.uncategorized : categories.list.some((c) => String(c.id) === filters.category);
    if (!exists) setFilters((f) => ({ ...f, category: "all" }));
  }, [categories, filters.category]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = products.filter((p) => {
      if (filters.status !== "all" && p.status !== filters.status) return false;
      if (filters.category === "none" && p.categoryId !== null) return false;
      if (filters.category !== "all" && filters.category !== "none" && String(p.categoryId) !== filters.category) return false;
      if (filters.units === "yes" && p.sizes.length === 0) return false;
      if (filters.units === "no" && p.sizes.length > 0) return false;
      if (filters.stock === "zero" && p.stockQty === null) return false;
      if (filters.stock === "unset" && p.stockQty !== null) return false;
      if (term) {
        const hay = `${p.name} ${p.sku ?? ""} ${p.barcode ?? ""} ${p.categoryName ?? ""} ${p.brandName ?? ""} ${p.sizes.map((z) => z.label).join(" ")}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    if (!sort) return list; // most recently changed first, as the server sends it
    const v = (p: StockOut2Row): string | number => {
      switch (sort.key) {
        case "name": return p.name.toLowerCase();
        case "category": return (p.categoryName ?? "\uffff").toLowerCase();
        case "price": return effectivePrice(p);
        case "status": return p.status;
      }
    };
    return [...list].sort((a, b) => {
      const va = v(a);
      const vb = v(b);
      const c = va < vb ? -1 : va > vb ? 1 : a.id - b.id;
      return sort.dir === "asc" ? c : -c;
    });
  }, [products, filters, q, sort]);

  // Back to page 1 whenever the result set's definition changes.
  useEffect(() => setPage(1), [filters, q, sort, pageSize]);
  // Forget selections that are no longer in the list (restocked).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(products.map((p) => p.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [products]);

  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = pageSize === 0 ? 0 : (current - 1) * pageSize;
  const rows = pageSize === 0 ? filtered : filtered.slice(start, start + pageSize);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS) || search.trim() !== "";
  const pageAll = rows.length > 0 && rows.every((p) => selected.has(p.id));
  const selRows = products.filter((p) => selected.has(p.id));

  function exportCsv(list: StockOut2Row[], label: string) {
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["ID", "Name", "Category", "Brand", "SKU", "Barcode", "Price", "Sale Price", "Stock", "Unit", "Status", "Units (stock)"].join(",")];
    for (const p of list) {
      const units = p.sizes.map((z) => `${z.label}: ${z.stockQty === null ? "not tracked" : z.stockQty}`).join(" | ");
      lines.push(
        [p.id, p.name, p.categoryName, p.brandName, p.sku, p.barcode, p.price.toFixed(2), p.salePrice === null ? "" : p.salePrice.toFixed(2),
          p.stockQty, p.unit, p.status === "active" ? "Active" : "Inactive", units].map(cell).join(",")
      );
    }
    // BOM so Excel reads ₹ and Hindi names correctly.
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-out-products-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Header Export button → exports what the filters currently show.
  const exportRef = useRef<() => void>(() => {});
  exportRef.current = () => (filtered.length ? exportCsv(filtered, "shown") : setToast({ ok: false, text: "There are no products to export." }));
  useEffect(() => {
    const onExport = () => exportRef.current();
    window.addEventListener(EVT_EXPORT, onExport);
    return () => window.removeEventListener(EVT_EXPORT, onExport);
  }, []);

  const markBusy = (ids: number[], on: boolean) =>
    setBusy((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  /** Change Active / Inactive for one or many products — shown at once, put back if the server says no. */
  async function setStatus(requested: number[], status: "active" | "inactive") {
    const word = status === "active" ? "activated" : "deactivated";
    const ids = requested.filter((id) => products.find((p) => p.id === id)?.status !== status);
    if (ids.length === 0) {
      if (requested.length) setToast({ ok: true, text: requested.length === 1 ? `Already ${status === "active" ? "active" : "inactive"}.` : `All ${requested.length} are already ${status === "active" ? "active" : "inactive"}.` });
      return;
    }
    const before = new Map(products.filter((p) => ids.includes(p.id)).map((p) => [p.id, p.status]));
    setProducts((list) => list.map((p) => (ids.includes(p.id) ? { ...p, status } : p)));
    markBusy(ids, true);
    const failed: number[] = [];
    // A few at a time, to keep the small DB pool free.
    for (let i = 0; i < ids.length; i += 4) {
      const chunk = ids.slice(i, i + 4);
      const res = await Promise.all(
        chunk.map((id) =>
          fetch(`/api/ecommerce/products/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
            .then(async (r) => r.ok && (await r.json().catch(() => ({}))).success === true)
            .catch(() => false)
        )
      );
      res.forEach((ok, j) => !ok && failed.push(chunk[j]));
    }
    markBusy(ids, false);
    if (failed.length) setProducts((list) => list.map((p) => (failed.includes(p.id) ? { ...p, status: before.get(p.id) ?? p.status } : p)));
    const done = ids.length - failed.length;
    setToast(
      failed.length
        ? { ok: false, text: ids.length === 1 ? "Couldn't change the status. Please try again." : `${done} ${word}, ${failed.length} could not be changed. Please try again.` }
        : { ok: true, text: ids.length === 1 ? `“${products.find((p) => p.id === ids[0])?.name ?? "Product"}” ${word}.` : `${done} products ${word}.` }
    );
    router.refresh();
  }

  /**
   * Saves the stock editor: the product's stock and/or its units' stock, in one
   * request. Returns an error message to show inside the editor, or null on
   * success. A product that now has stock leaves this list (it's no longer out
   * of stock); one that's still at 0 stays, with its new unit numbers.
   */
  async function saveStock(id: number, payload: { qty?: number; sizes: { id: number; stockQty: number | null }[] }): Promise<string | null> {
    const p = products.find((x) => x.id === id);
    if (!p) return "This product is no longer in the list.";
    markBusy([id], true);
    try {
      const res = await fetch(`/api/ecommerce/stock-out2/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; stockQty?: number | null; sizes?: { id: number; stockQty: number | null }[] };
      if (!res.ok || data.success !== true) return data.message || "Couldn't update the stock. Please try again.";

      const newQty = data.stockQty === undefined ? p.stockQty : data.stockQty;
      const unitStock = new Map((data.sizes ?? []).map((z) => [z.id, z.stockQty] as const));
      const unitsChanged = payload.sizes.length;
      setEditor(null);

      if (newQty !== null && newQty > 0) {
        setProducts((list) => list.filter((x) => x.id !== id));
        setSelected((s) => new Set([...s].filter((x) => x !== id)));
        setToast({
          ok: true,
          text: `“${p.name}” restocked — ${newQty.toLocaleString("en-IN")}${p.unit ? ` ${p.unit}` : ""} in stock${unitsChanged ? `, ${unitsWord(unitsChanged)} updated` : ""}. It's no longer on this list.`,
        });
      } else {
        setProducts((list) =>
          list.map((x) =>
            x.id === id ? { ...x, stockQty: newQty, sizes: x.sizes.map((z) => (unitStock.has(z.id) ? { ...z, stockQty: unitStock.get(z.id) ?? null } : z)) } : x
          )
        );
        setToast({ ok: true, text: `Stock of “${p.name}” saved${unitsChanged ? ` (${unitsWord(unitsChanged)} updated)` : ""}. It's still out of stock.` });
      }
      router.refresh();
      return null;
    } catch {
      return "Could not reach the server. Please try again.";
    } finally {
      markBusy([id], false);
    }
  }

  const toggleEditor = (id: number, el: HTMLElement) => setEditor((cur) => (cur && cur.id === id && cur.anchor === el ? null : { id, anchor: el }));
  const closeEditor = useCallback(() => setEditor(null), []);
  const editorProduct = editor ? products.find((p) => p.id === editor.id) ?? null : null;
  // The product left the list (restocked, or the list refreshed) — close its editor.
  useEffect(() => {
    if (editor && !editorProduct) setEditor(null);
  }, [editor, editorProduct]);

  function toggleSort(k: SortKey) {
    setSort((s) => (!s || s.key !== k ? { key: k, dir: k === "price" ? "desc" : "asc" } : { key: k, dir: s.dir === "asc" ? "desc" : "asc" }));
  }
  function toggleSel(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // Columns (Display Options). Narrower fixed columns under 1500px so Name keeps room on laptops.
  const COLS: { key: string; label: string; width?: string; sort?: SortKey }[] = [
    { key: "so2-c-select", label: "", width: "w-[44px] min-[1500px]:w-[52px]" },
    { key: "so2-c-image", label: "Image", width: "w-[88px] min-[1500px]:w-[110px]" },
    { key: "so2-c-name", label: "Name", sort: "name" },
    { key: "so2-c-category", label: "Category", width: "w-[130px] min-[1500px]:w-[170px]", sort: "category" },
    { key: "so2-c-price", label: "Price", width: "w-[112px] min-[1500px]:w-[130px]", sort: "price" },
    { key: "so2-c-status", label: "Status", width: "w-[136px] min-[1500px]:w-[150px]", sort: "status" },
    { key: "so2-c-stock", label: "Stock", width: "w-[168px] min-[1500px]:w-[190px]" },
    { key: "so2-c-actions", label: "Actions", width: "w-[116px] min-[1500px]:w-[130px]" },
  ];
  const cols = COLS.filter((c) => show("so2-table") && show(c.key));
  const cardKeys = ["so2-k-total", "so2-k-active", "so2-k-inactive", "so2-k-units"].filter(show);
  const filterKeys = ["so2-f-status", "so2-f-category", "so2-f-units", "so2-f-stock"].filter(show);
  const td = "border border-[#dee2e6] px-3 align-middle";

  return (
    // Invisible until the saved Display Options are read, so hidden parts never flash in.
    <div className={cn("space-y-5", !loaded && "invisible")}>
      {/* ── summary cards (click to filter) ── */}
      {show("so2-cards") && cardKeys.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {show("so2-k-total") && (
            <StatCard icon={PackageX} tint="bg-red-50 text-red-500" value={stats.total} label="Out of Stock" active={!filtersActive}
              onClick={() => { setFilters(NO_FILTERS); setSearch(""); }} />
          )}
          {show("so2-k-active") && (
            <StatCard icon={BadgeCheck} tint="bg-emerald-50 text-emerald-600" value={stats.active} label="Active (Live in Shop)" active={filters.status === "active"}
              onClick={() => setF("status", filters.status === "active" ? "all" : "active")} />
          )}
          {show("so2-k-inactive") && (
            <StatCard icon={EyeOff} tint="bg-slate-100 text-slate-500" value={stats.inactive} label="Inactive" active={filters.status === "inactive"}
              onClick={() => setF("status", filters.status === "inactive" ? "all" : "inactive")} />
          )}
          {show("so2-k-units") && (
            <StatCard icon={Layers} tint="bg-violet-50 text-violet-600" value={stats.withUnits} label="With Units" active={filters.units === "yes"}
              onClick={() => setF("units", filters.units === "yes" ? "all" : "yes")} />
          )}
        </div>
      )}

      {/* ── filters (all live) ── */}
      {show("so2-filters") && filterKeys.length > 0 && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {show("so2-f-status") && (
              <FilterSelect icon={CircleDot} label="Status" value={filters.status} onChange={(v) => setF("status", v as Filters["status"])}
                dot={filters.status === "active" ? "bg-emerald-500" : filters.status === "inactive" ? "bg-slate-400" : undefined}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </FilterSelect>
            )}
            {show("so2-f-category") && (
              <FilterSelect icon={FolderTree} label="Category" value={filters.category} onChange={(v) => setF("category", v)}>
                <option value="all">All Categories</option>
                {categories.list.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                {categories.uncategorized && <option value="none">Uncategorized</option>}
              </FilterSelect>
            )}
            {show("so2-f-units") && (
              <FilterSelect icon={Layers} label="Units" value={filters.units} onChange={(v) => setF("units", v as Filters["units"])}>
                <option value="all">All Products</option>
                <option value="yes">With Units</option>
                <option value="no">Without Units</option>
              </FilterSelect>
            )}
            {show("so2-f-stock") && (
              <FilterSelect icon={Boxes} label="Stock" value={filters.stock} onChange={(v) => setF("stock", v as Filters["stock"])}>
                <option value="all">All</option>
                <option value="zero">Zero stock</option>
                <option value="unset">Stock not set</option>
              </FilterSelect>
            )}
          </div>
        </section>
      )}

      {/* ── table: the "sheet" look from the current Stock Out page ── */}
      {show("so2-table") && (
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

            {show("so2-c-select") && (
              <>
                <ActionMenu
                  label={`Bulk Actions${selected.size ? ` (${selected.size})` : ""}`}
                  disabled={selected.size === 0}
                  trigger={<><Layers className="h-3.5 w-3.5" /> Bulk Actions{selected.size ? ` (${selected.size})` : ""}</>}
                  items={[
                    { label: "Set Active", onClick: () => setStatus([...selected], "active") },
                    { label: "Set Inactive", onClick: () => setStatus([...selected], "inactive") },
                    { label: "Export selected (CSV)", onClick: () => exportCsv(selRows, "selected") },
                  ]}
                />
                {selected.size > 0 && (
                  <button type="button" onClick={() => setSelected(new Set())} className="text-[13px] text-admin-gray-500 hover:underline">Clear selection</button>
                )}
              </>
            )}

            {filtersActive && (
              <button type="button" onClick={() => { setFilters(NO_FILTERS); setSearch(""); }} className="flex items-center gap-1 text-[13px] font-medium text-[#2563eb] hover:underline">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}

            {show("so2-t-search") && (
              <label className="ml-auto flex items-center gap-2">
                Search:
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search stock out products" placeholder="Name, SKU, barcode…"
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
                      c.key === "so2-c-select" ? (
                        <th key={c.key} className={cn(td, "text-center")}>
                          <input type="checkbox" checked={pageAll} aria-label="Select products on this page" className="h-4 w-4 accent-[#2563eb]"
                            onChange={(e) => setSelected((s) => { const n = new Set(s); rows.forEach((p) => (e.target.checked ? n.add(p.id) : n.delete(p.id))); return n; })} />
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
                    <tr>
                      <td colSpan={cols.length} className={cn(td, "py-12 text-center text-admin-gray-500")}>
                        {products.length === 0 ? (
                          <span className="inline-flex items-center gap-2"><PartyPopper className="h-5 w-5 text-emerald-500" /> Nothing is out of stock right now.</span>
                        ) : (
                          "No products match these filters."
                        )}
                      </td>
                    </tr>
                  ) : (
                    rows.map((p) => {
                      const isBusy = busy.has(p.id);
                      const editing = editor?.id === p.id;
                      return (
                        <tr key={p.id} style={{ height: ROW_H }} className={cn(selected.has(p.id) ? "bg-blue-50/60" : "odd:bg-[#f2f2f2] even:bg-white", isBusy && "opacity-60")}>
                          {show("so2-c-select") && (
                            <td className={cn(td, "text-center")}>
                              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSel(p.id)} aria-label={`Select ${p.name}`} className="h-4 w-4 accent-[#2563eb]" />
                            </td>
                          )}
                          {show("so2-c-image") && (
                            <td className={td}>
                              <Link href={EDIT_HREF(p.id)} tabIndex={-1} aria-hidden="true" className="block w-fit"><Thumb src={p.image} name={p.name} size={56} /></Link>
                            </td>
                          )}
                          {show("so2-c-name") && (
                            <td className={td}>
                              <Link href={EDIT_HREF(p.id)} title={`Edit ${p.name}`} className="block max-w-full truncate text-admin-gray-900 hover:text-[#2563eb] hover:underline">{p.name}</Link>
                              {(p.brandName || p.sku) && <div className="truncate text-xs text-admin-gray-500">{p.brandName ?? p.sku}</div>}
                            </td>
                          )}
                          {show("so2-c-category") && (
                            <td className={td}>
                              {p.categoryName && p.categoryId !== null ? (
                                <button type="button" onClick={() => setF("category", String(p.categoryId))} title={`Show only ${p.categoryName}`}
                                  className="block max-w-full truncate text-left hover:text-[#2563eb] hover:underline">{p.categoryName}</button>
                              ) : <span className="text-admin-gray-400">—</span>}
                            </td>
                          )}
                          {show("so2-c-price") && (
                            <td className={cn(td, "whitespace-nowrap")}>
                              <div>{money(effectivePrice(p))}</div>
                              {hasSale(p) && <div className="text-xs text-admin-gray-400 line-through">{money(p.price)}</div>}
                            </td>
                          )}
                          {show("so2-c-status") && (
                            <td className={td}>
                              <StatusPill
                                label={`Change status of ${p.name}`}
                                value={p.status === "active" ? "active" : "inactive"}
                                options={PRODUCT_STATUS}
                                disabled={isBusy}
                                onChange={(next) => setStatus([p.id], next)}
                              />
                            </td>
                          )}
                          {show("so2-c-stock") && (
                            <td className={td}>
                              <PillButton variant="danger" caret disabled={isBusy} onClick={(e) => toggleEditor(p.id, e.currentTarget)} aria-haspopup="dialog" aria-expanded={editing}
                                aria-label={`Update stock for ${p.name}`} title="Click to update stock"
                                className={cn("max-w-full", editing && "ring-2 ring-[#ef4444]/30 ring-offset-1")}>
                                <span className="truncate">{stockLabel(p)}</span>
                              </PillButton>
                              {p.sizes.length > 0 && <div className="mt-1 text-xs text-admin-gray-500">{unitsWord(p.sizes.length)}</div>}
                            </td>
                          )}
                          {show("so2-c-actions") && (
                            <td className={td}>
                              <div className="flex gap-[0.4rem]">
                                <IconAction tone="add" disabled={isBusy} onClick={(e) => toggleEditor(p.id, e.currentTarget)} title={`Restock ${p.name}`}><PackagePlus /></IconAction>
                                <IconAction tone="edit" href={EDIT_HREF(p.id)} title={`Edit ${p.name}`}><SquarePen /></IconAction>
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
          )}

          <div className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-3 text-[15px] text-admin-gray-800">
            <span>
              {filtered.length === 0 ? "Showing 0 entries" : `Showing ${start + 1} to ${start + rows.length} of ${filtered.length} entries`}
              {filtered.length !== products.length && <span className="text-admin-gray-500"> (filtered from {products.length} total entries)</span>}
            </span>
            {pageCount > 1 && <Pager page={current} pageCount={pageCount} onPage={setPage} />}
          </div>
        </section>
      )}

      {editor && editorProduct && (
        <StockEditor key={editorProduct.id} p={editorProduct} anchor={editor.anchor} onClose={closeEditor} onSave={(payload) => saveStock(editorProduct.id, payload)} />
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

/* ───────────────────────── stock editor ───────────────────────── */

const EDITOR_W = 340;
const WHOLE = /^\d+$/;

/**
 * Opens under the Stock pill (or the green Restock button): the product's
 * stock and, only when the product has Sizes / Units, a stock box for each
 * unit — so everything is updated together in one save. A product without
 * units shows just the one stock box.
 *
 * Leaving the product stock blank keeps it as it is (useful to update only
 * the units). A blank unit box means "this unit's stock isn't tracked".
 */
function StockEditor({ p, anchor, onClose, onSave }: {
  p: StockOut2Row;
  anchor: HTMLElement;
  onClose: () => void;
  onSave: (payload: { qty?: number; sizes: { id: number; stockQty: number | null }[] }) => Promise<string | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [qty, setQty] = useState("");
  const original = useMemo(() => Object.fromEntries(p.sizes.map((z) => [z.id, z.stockQty === null ? "" : String(z.stockQty)])) as Record<number, string>, [p.sizes]);
  const [units, setUnits] = useState<Record<number, string>>(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const place = useCallback(() => {
    const r = anchor.getBoundingClientRect();
    // The pill scrolled out of view — nothing left to attach to.
    if (r.bottom < 0 || r.top > window.innerHeight) return onClose();
    const H = box.current?.offsetHeight ?? 320;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - EDITOR_W - 8));
    const below = r.bottom + 6;
    const top = below + H > window.innerHeight - 8 ? Math.max(8, r.top - 6 - H) : below;
    setPos((c) => (c.top === top && c.left === left ? c : { top, left }));
  }, [anchor, onClose]);

  useLayoutEffect(() => {
    place();
  }, [place, error, p.sizes.length]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    input.current?.focus();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !anchor.contains(t)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, place]);

  const qtyTrim = qty.trim();
  const qtyValid = qtyTrim === "" || WHOLE.test(qtyTrim);
  const qtyChanged = qtyTrim !== "" && qtyValid && Number(qtyTrim) !== p.stockQty;
  const unitValid = (id: number) => (units[id] ?? "").trim() === "" || WHOLE.test((units[id] ?? "").trim());
  const changedUnits = p.sizes.filter((z) => (units[z.id] ?? "").trim() !== (original[z.id] ?? ""));
  const allValid = qtyValid && p.sizes.every((z) => unitValid(z.id));
  const canSave = allValid && (qtyChanged || changedUnits.length > 0) && !saving;
  const newQty = qtyChanged ? Number(qtyTrim) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const err = await onSave({
      ...(qtyChanged ? { qty: Number(qtyTrim) } : {}),
      sizes: changedUnits.map((z) => ({ id: z.id, stockQty: (units[z.id] ?? "").trim() === "" ? null : Number((units[z.id] ?? "").trim()) })),
    });
    // On success the parent closes (or removes) this editor.
    if (err) {
      setError(err);
      setSaving(false);
    }
  }

  const fieldCls = "h-9 rounded-[0.375rem] border bg-white px-2.5 text-sm outline-none focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15";

  return createPortal(
    <div ref={box} role="dialog" aria-label={`Update stock — ${p.name}`} style={{ top: pos.top, left: pos.left, width: EDITOR_W }}
      className="fixed z-[400] flex max-h-[calc(100vh-16px)] flex-col rounded-[0.5rem] border border-admin-gray-200 bg-white text-[13px] shadow-[0_0.5rem_1.5rem_rgba(0,0,0,.15)]">
      <form onSubmit={submit} className="flex min-h-0 flex-col">
        <div className="border-b border-admin-gray-100 px-3.5 py-3">
          <div className="truncate font-semibold text-admin-gray-900" title={p.name}>{p.name}</div>
          <div className="text-xs text-admin-gray-500">Current stock: <b className="text-red-600">{p.stockQty === null ? "not set" : p.stockQty}</b></div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
          <label className="mb-1 block text-xs font-medium text-admin-gray-600">New stock{p.unit ? ` (${p.unit})` : ""}</label>
          <input ref={input} type="number" inputMode="numeric" min={0} step={1} value={qty} onChange={(e) => { setQty(e.target.value); setError(null); }}
            placeholder={p.sizes.length ? "Leave blank to keep as is" : "Enter quantity"} aria-label="New stock quantity"
            className={cn(fieldCls, "w-full", qtyValid ? "border-[#dee2e6]" : "border-red-400")} />
          {newQty !== null && (
            <div className="mt-1.5 text-xs text-admin-gray-500">
              Stock: <b className="text-admin-gray-800">{p.stockQty ?? 0}</b> → <b className={newQty > 0 ? "text-emerald-600" : "text-admin-gray-800"}>{newQty}</b>
              {newQty > 0 && <span> · moves off this list</span>}
            </div>
          )}

          {p.sizes.length > 0 && (
            <div className="mt-4 border-t border-admin-gray-100 pt-3">
              <div className="mb-0.5 font-semibold text-admin-gray-900">Units ({p.sizes.length})</div>
              <p className="mb-2.5 text-xs text-admin-gray-500">Stock for each unit. Leave blank if you don&apos;t track it.</p>
              <div className="space-y-2">
                {p.sizes.map((z) => {
                  const changed = (units[z.id] ?? "").trim() !== (original[z.id] ?? "");
                  return (
                    <label key={z.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-admin-gray-800" title={z.label}>{z.label}</span>
                        <span className="block text-[11px] text-admin-gray-500">{money(z.price ?? z.mrp)}{z.isDefault ? " · Default" : ""}</span>
                      </span>
                      <input type="number" inputMode="numeric" min={0} step={1} value={units[z.id] ?? ""} placeholder="Not tracked" aria-label={`Stock for ${z.label}`}
                        onChange={(e) => { setUnits((u) => ({ ...u, [z.id]: e.target.value })); setError(null); }}
                        className={cn(fieldCls, "w-[112px] shrink-0", !unitValid(z.id) ? "border-red-400" : changed ? "border-[#2563eb]" : "border-[#dee2e6]")} />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {!allValid && <p className="mt-3 text-xs text-red-600">Stock must be a whole number, 0 or more.</p>}
          {error && <p role="alert" className="mt-3 rounded-[0.375rem] bg-red-50 px-2.5 py-2 text-xs text-red-700">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-admin-gray-100 px-3.5 py-2.5">
          <button type="button" onClick={onClose} className="h-8 rounded-[0.375rem] bg-[#6c757d] px-3.5 text-xs font-medium text-white hover:bg-[#5c636a]">Cancel</button>
          <button type="submit" disabled={!canSave} className="flex h-8 items-center gap-1.5 rounded-[0.375rem] bg-[#2563eb] px-3.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save stock
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

/* ───────────────────────── pieces ───────────────────────── */

/** Product image — falls back to a grey placeholder when there's none or the file is missing. */
function Thumb({ src, name, size = 56 }: { src: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A missing file can fail before the page is interactive (onError is missed), so also check once mounted.
  useEffect(() => {
    const el = img.current;
    setBroken(!!el && el.complete && el.naturalWidth === 0);
  }, [src]);
  const box = { width: size, height: size };
  if (!src || broken) {
    return (
      <span style={box} className="flex items-center justify-center rounded-[0.375rem] bg-admin-gray-100 text-admin-gray-400" title={src ? "Image file is missing" : "No image"}>
        <ImageIcon className="h-5 w-5" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src.startsWith("http") || src.startsWith("blob:") ? src : `/${src}`} ref={img} alt="" title={name} loading="lazy" style={box} onError={() => setBroken(true)} className="rounded-[0.375rem] border border-admin-gray-200 bg-white object-contain p-1" />;
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

/** DataTables-style pager: Previous · 1 2 3 · Next */
function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = "flex h-10 min-w-10 items-center justify-center border border-[#dee2e6] px-3 text-sm -ml-px first:ml-0 first:rounded-l-[0.375rem] last:rounded-r-[0.375rem]";
  return (
    <nav className="flex" aria-label="Stock out pages">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={cn(btn, "gap-1 text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300 disabled:hover:bg-transparent")}><ChevronLeft className="h-4 w-4" /> Previous</button>
      {nums.map((n, i) => n === "…"
        ? <span key={`e${i}`} className={cn(btn, "text-admin-gray-400")}>…</span>
        : <button key={n} type="button" aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}
            className={cn(btn, n === page ? "relative z-10 border-[#2563eb] bg-[#2563eb] text-white" : "text-[#2563eb] hover:bg-admin-gray-50")}>{n}</button>)}
      <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)} className={cn(btn, "gap-1 text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300 disabled:hover:bg-transparent")}>Next <ChevronRight className="h-4 w-4" /></button>
    </nav>
  );
}
