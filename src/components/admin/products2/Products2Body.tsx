"use client";

import Link from "next/link";
import { createContext, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ShoppingBag, BadgeCheck, PackageX, TriangleAlert, Search, CircleDot, Boxes, Tag, LayoutGrid, FolderTree, ChevronDown,
  Layers, Download, Barcode, SquarePen, Trash2, ImageIcon, ChevronsUpDown, ArrowUp, ArrowDown,
  Loader2, CheckCircle2, AlertCircle, X, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { Pager } from "@/components/admin/campaigns2/ui";
import { ActionMenu, IconAction, PillButton, StatusPill, type PillOption } from "@/components/admin/ui/buttons";
import { EMPTY_PRODUCTS2_FILTERS, LOW_STOCK_LIMIT, type Products2Filters } from "./filters";

/* ───────────────────────── types & helpers ───────────────────────── */

export interface Product2Row {
  id: number;
  name: string;
  image: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  salePrice: number | null;
  status: string; // "active" | "inactive"
  productType: string;
  stockQty: number | null;
  badgeTag: string;
  itemType: string;
  unit: string | null;
  categoryId: number | null;
  categoryName: string | null;
  brandName?: string | null;
  createdAt: string;
}

export interface Product2Badge { slug: string; label: string; color: string | null }
export interface Product2ItemType { slug: string; label: string }
export interface Product2Category { id: number; name: string }

const PAGE_PATH = "/admin/ecommerce/products2";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hasSale = (p: Product2Row) => p.salePrice !== null && p.salePrice > 0 && p.salePrice < p.price;
const effectivePrice = (p: Product2Row) => (hasSale(p) ? (p.salePrice as number) : p.price);
/** Same rule as the Stock Out Products page: a physical product whose stock is empty or not set. */
const isOutOfStock = (p: Product2Row) => p.productType === "physical" && (p.stockQty === null || p.stockQty <= 0);
/** Physical, still in stock, but LOW_STOCK_LIMIT units or fewer. */
const isLowStock = (p: Product2Row) => p.productType === "physical" && p.stockQty !== null && p.stockQty > 0 && p.stockQty <= LOW_STOCK_LIMIT;

type SortKey = "name" | "stock" | "category" | "price" | "status" | "type" | "item" | "created";

/* ───────────────────────── shared state ─────────────────────────
 * The header (search, Export) and the page body are separate parts of the
 * AdminShell, so the product list, filters and selection live in one provider
 * that wraps both. Everything filters in the browser — no server round-trip.
 */

interface Products2State {
  products: Product2Row[];
  setProducts: React.Dispatch<React.SetStateAction<Product2Row[]>>;
  badges: Product2Badge[];
  itemTypes: Product2ItemType[];
  categories: Product2Category[];
  filters: Products2Filters;
  setFilters: React.Dispatch<React.SetStateAction<Products2Filters>>;
  setFilter: <K extends keyof Products2Filters>(key: K, value: Products2Filters[K]) => void;
  sort: { key: SortKey; dir: "asc" | "desc" };
  toggleSort: (k: SortKey) => void;
  filtered: Product2Row[];
  selected: Set<number>;
  setSelected: React.Dispatch<React.SetStateAction<Set<number>>>;
  typeLabel: (slug: string) => string;
  itemLabel: (slug: string) => string;
  exportCsv: (list: Product2Row[], label: string) => void;
}

const Ctx = createContext<Products2State | null>(null);

function useProducts2(): Products2State {
  const v = useContext(Ctx);
  if (!v) throw new Error("Products2 components must be inside <Products2Provider>");
  return v;
}

export function Products2Provider({ products: initial, badges, itemTypes, categories, initialFilters, children }: {
  products: Product2Row[];
  badges: Product2Badge[];
  itemTypes: Product2ItemType[];
  categories: Product2Category[];
  initialFilters: Products2Filters;
  children: React.ReactNode;
}) {
  // Local copy so publish/unpublish/delete show instantly; replaced whenever
  // the server sends a fresh list (router.refresh after a change).
  const [products, setProducts] = useState(initial);
  useEffect(() => setProducts(initial), [initial]);

  const [filters, setFilters] = useState<Products2Filters>(initialFilters);
  const deferredQ = useDeferredValue(filters.q);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "created", dir: "desc" });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const badgeBySlug = useMemo(() => new Map(badges.map((b) => [b.slug, b])), [badges]);
  const itemBySlug = useMemo(() => new Map(itemTypes.map((t) => [t.slug, t])), [itemTypes]);
  const typeLabel = (slug: string) => (slug === "none" ? "None" : badgeBySlug.get(slug)?.label ?? slug);
  const itemLabel = (slug: string) => (slug === "normal" ? "Normal" : itemBySlug.get(slug)?.label ?? slug);

  // Keep the filters in the address bar (no navigation, no reload) so a
  // refresh or a shared link opens the same view.
  useEffect(() => {
    const p = new URLSearchParams();
    if (filters.q.trim()) p.set("q", filters.q.trim());
    if (filters.status !== "all") p.set("status", filters.status);
    if (filters.stock !== "all") p.set("stock", filters.stock);
    if (filters.category !== "all") p.set("category", filters.category);
    if (filters.type !== "all") p.set("type", filters.type);
    if (filters.item !== "all") p.set("item", filters.item);
    const qs = p.toString();
    window.history.replaceState(window.history.state, "", qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH);
  }, [filters]);

  const filtered = useMemo(() => {
    const term = deferredQ.trim().toLowerCase();
    const list = products.filter((p) => {
      if (filters.status !== "all" && p.status !== filters.status) return false;
      if (filters.stock === "out" && !isOutOfStock(p)) return false;
      if (filters.stock === "low" && !isLowStock(p)) return false;
      if (filters.stock === "in" && isOutOfStock(p)) return false;
      if (filters.category === "none" && p.categoryId !== null) return false;
      if (filters.category !== "all" && filters.category !== "none" && String(p.categoryId) !== filters.category) return false;
      if (filters.type !== "all" && p.badgeTag !== filters.type) return false;
      if (filters.item !== "all" && p.itemType !== filters.item) return false;
      if (term && !`${p.name} ${p.sku ?? ""} ${p.barcode ?? ""} ${p.categoryName ?? ""} ${p.brandName ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const val = (p: Product2Row): string | number => {
      switch (sort.key) {
        case "name": return p.name.toLowerCase();
        case "stock": return p.productType === "physical" ? p.stockQty ?? 0 : Number.MAX_SAFE_INTEGER;
        case "category": return (p.categoryName ?? "\uffff").toLowerCase();
        case "price": return effectivePrice(p);
        case "status": return p.status;
        case "type": return typeLabel(p.badgeTag).toLowerCase();
        case "item": return itemLabel(p.itemType).toLowerCase();
        case "created": return p.createdAt;
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = va < vb ? -1 : va > vb ? 1 : a.id - b.id;
      return sort.dir === "asc" ? c : -c;
    });
    // typeLabel/itemLabel only depend on badges/itemTypes, which never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, filters.status, filters.stock, filters.category, filters.type, filters.item, deferredQ, sort]);

  // Forget selections that are no longer in the list (deleted).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(products.map((p) => p.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [products]);

  function exportCsv(list: Product2Row[], label: string) {
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["ID", "Name", "Category", "SKU", "Barcode", "Price", "Sale Price", "Stock", "Unit", "Status", "Type", "Item Type"].join(",")];
    for (const p of list) {
      lines.push(
        [p.id, p.name, p.categoryName, p.sku, p.barcode, p.price.toFixed(2), p.salePrice === null ? "" : p.salePrice.toFixed(2),
          p.stockQty, p.unit, p.status === "active" ? "Published" : "Unpublished", typeLabel(p.badgeTag), itemLabel(p.itemType)]
          .map(cell)
          .join(",")
      );
    }
    // BOM so Excel reads ₹ and Hindi names correctly.
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const value: Products2State = {
    products, setProducts, badges, itemTypes, categories,
    filters, setFilters,
    setFilter: (key, v) => setFilters((f) => ({ ...f, [key]: v })),
    sort,
    toggleSort: (k) =>
      setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "price" ? "desc" : "asc" })),
    filtered, selected, setSelected, typeLabel, itemLabel, exportCsv,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ───────────────────────── header controls ───────────────────────── */

/** The header search box — searches this page's products (name, SKU, barcode, category), live as you type. Press "/" to jump to it. */
export function Products2HeaderSearch({ className }: { className?: string }) {
  const { filters, setFilter } = useProducts2();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;
      // Two copies exist (header ≥1280px, toolbar below); focus the visible one.
      if (!ref.current || ref.current.offsetParent === null) return;
      e.preventDefault();
      ref.current.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
      <input
        ref={ref}
        type="text"
        value={filters.q}
        onChange={(e) => setFilter("q", e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setFilter("q", "");
            e.currentTarget.blur();
          }
        }}
        placeholder="Search products, SKU, barcode…"
        autoComplete="off"
        aria-label="Search products"
        className="h-10 w-full rounded-[0.5rem] border border-[#e5e7eb] bg-white pl-9 pr-9 text-[0.875rem] text-admin-gray-900 outline-none transition-all placeholder:text-[#9ca3af] focus:border-orange-400 focus:shadow-[0_0_0_3px_#ffedd5]"
      />
      {filters.q ? (
        <button
          type="button"
          onClick={() => {
            setFilter("q", "");
            ref.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-admin-gray-400 hover:bg-admin-gray-100 hover:text-admin-gray-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-admin-gray-200 px-1.5 text-[11px] leading-5 text-admin-gray-400">/</kbd>
      )}
    </div>
  );
}

/** Header Export — CSV of the products shown by the filters, the selected ones, or all. */
export function Products2ExportMenu() {
  const { filtered, selected, products, exportCsv } = useProducts2();
  const selectedRows = products.filter((p) => selected.has(p.id));
  return (
    <ActionMenu
      label="Export"
      align="right"
      bare
      triggerClassName="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]"
      trigger={<><Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" /></>}
      items={[
        { label: `Shown products (${filtered.length})`, hint: "CSV", onClick: () => exportCsv(filtered, "filtered"), disabled: filtered.length === 0 },
        { label: `Selected products (${selectedRows.length})`, hint: "CSV", onClick: () => exportCsv(selectedRows, "selected"), disabled: selectedRows.length === 0 },
        { label: `All products (${products.length})`, hint: "CSV", onClick: () => exportCsv(products, "all"), disabled: products.length === 0 },
      ]}
    />
  );
}

export function Products2AddButton() {
  return (
    <Link
      href="/admin/ecommerce/add-product2"
      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-orange-500 px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
    >
      <Plus className="h-4 w-4" />
      {/* Shorter label on laptop widths so the header stays on one line. */}
      <span className="xl:hidden min-[1440px]:inline">Add Product</span>
      <span className="hidden xl:inline min-[1440px]:hidden">Add</span>
    </Link>
  );
}

const PRODUCT_STATUS: readonly PillOption<"active" | "inactive">[] = [
  { value: "active", label: "Published", variant: "success" },
  { value: "inactive", label: "Unpublished", variant: "secondary" },
];

/* ───────────────────────── page body ───────────────────────── */

/** Row and header heights (px) — same as the Sales History ledger. Fixed, so filtering never makes the table jump. */
const ROW_H = 54;
const HEAD_H = 42;
const MIN_ROWS = 10;

export function Products2Body({ notice }: { notice?: string | null } = {}) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const {
    products, setProducts, badges, itemTypes, categories, filters, setFilters, setFilter, sort, toggleSort,
    filtered, selected, setSelected, typeLabel, itemLabel,
  } = useProducts2();

  const [pageSize, setPageSize] = useState(20); // 0 = All
  const [page, setPage] = useState(1);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<{ ids: number[]; label: string } | null>(null);
  // "Product created/updated" message after coming back from Add / Edit Product.
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(notice ? { ok: true, text: notice } : null);

  const badgeBySlug = useMemo(() => new Map(badges.map((b) => [b.slug, b])), [badges]);
  const hasUncategorized = useMemo(() => products.some((p) => p.categoryId === null), [products]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Stats are always for the whole catalogue, like the original page.
  const stats = useMemo(
    () => ({
      total: products.length,
      published: products.filter((p) => p.status === "active").length,
      low: products.filter(isLowStock).length,
      out: products.filter(isOutOfStock).length,
    }),
    [products]
  );

  // Back to page 1 whenever the result set's definition changes.
  useEffect(() => setPage(1), [filters, sort, pageSize]);

  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = pageSize === 0 ? 0 : (current - 1) * pageSize;
  const pageRows = pageSize === 0 ? filtered : filtered.slice(start, start + pageSize);

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const pageAllSelected = pageRows.length > 0 && pageRows.every((p) => selected.has(p.id));
  const selectedIds = [...selected];
  const filtersActive =
    filters.q.trim() !== "" || filters.status !== "all" || filters.stock !== "all" || filters.category !== "all" || filters.type !== "all" || filters.item !== "all";

  function toggle(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selectMany(ids: number[], on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });
  }
  const markBusy = (ids: number[], on: boolean) =>
    setBusyIds((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  /** Runs `fn` for each id, a few at a time (keeps the small DB pool free). */
  async function inBatches(ids: number[], fn: (id: number) => Promise<boolean>) {
    const ok: number[] = [];
    const failed: number[] = [];
    for (let i = 0; i < ids.length; i += 4) {
      const chunk = ids.slice(i, i + 4);
      const res = await Promise.all(chunk.map((id) => fn(id).catch(() => false)));
      res.forEach((r, j) => (r ? ok : failed).push(chunk[j]));
    }
    return { ok, failed };
  }

  async function setStatus(requested: number[], status: "active" | "inactive") {
    const word = status === "active" ? "published" : "unpublished";
    // Only touch the ones that actually change.
    const ids = requested.filter((id) => products.find((p) => p.id === id)?.status !== status);
    if (ids.length === 0) {
      if (requested.length) setToast({ ok: true, text: requested.length === 1 ? `Already ${word}.` : `All ${requested.length} are already ${word}.` });
      return;
    }
    const before = new Map(products.filter((p) => ids.includes(p.id)).map((p) => [p.id, p.status]));
    // Show it straight away; put it back if the server says no.
    setProducts((list) => list.map((p) => (ids.includes(p.id) ? { ...p, status } : p)));
    markBusy(ids, true);
    const { ok, failed } = await inBatches(ids, async (id) => {
      const res = await fetch(`/api/ecommerce/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      return res.ok && (await res.json().catch(() => ({}))).success === true;
    });
    markBusy(ids, false);
    if (failed.length) {
      setProducts((list) => list.map((p) => (failed.includes(p.id) ? { ...p, status: before.get(p.id) ?? p.status } : p)));
    }
    setToast(
      failed.length
        ? { ok: false, text: ids.length === 1 ? `Couldn't change the status. Please try again.` : `${ok.length} ${word}, ${failed.length} could not be changed. Please try again.` }
        : { ok: true, text: ok.length === 1 ? `Product ${word}.` : `${ok.length} products ${word}.` }
    );
    router.refresh();
  }

  async function deleteProducts(ids: number[]) {
    setConfirm(null);
    markBusy(ids, true);
    const { ok, failed } = await inBatches(ids, async (id) => {
      const res = await fetch(`/api/ecommerce/products/${id}`, { method: "DELETE" });
      return res.ok && (await res.json().catch(() => ({}))).success === true;
    });
    markBusy(ids, false);
    if (ok.length) {
      setProducts((list) => list.filter((p) => !ok.includes(p.id)));
      setSelected((s) => new Set([...s].filter((id) => !ok.includes(id))));
    }
    if (failed.length) {
      const names = products.filter((p) => failed.includes(p.id)).map((p) => `“${p.name}”`);
      setToast({
        ok: false,
        text: `${ok.length ? `${ok.length} deleted. ` : ""}Couldn't delete ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""}. A product that already appears in orders can't be deleted — set it to Unpublish to hide it instead.`,
      });
    } else {
      setToast({ ok: true, text: ok.length === 1 ? "Product deleted." : `${ok.length} products deleted.` });
    }
    router.refresh();
  }

  function printBarcodes(ids: number[]) {
    if (ids.length) window.open(`/admin/ecommerce/barcode-print?ids=${ids.join(",")}`, "_blank", "noopener");
  }

  /** Stock editor: adds to (or sets) a physical product's stock via the same restock endpoint as Stock Out Products. */
  async function saveStock(id: number, newQty: number) {
    const p = products.find((x) => x.id === id);
    if (!p) return false;
    const before = p.stockQty;
    setProducts((list) => list.map((x) => (x.id === id ? { ...x, stockQty: newQty } : x)));
    markBusy([id], true);
    let ok = false;
    try {
      const res = await fetch(`/api/ecommerce/products/${id}/restock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty: newQty }),
      });
      ok = res.ok && (await res.json().catch(() => ({}))).success === true;
    } catch {
      ok = false;
    }
    markBusy([id], false);
    if (!ok) {
      setProducts((list) => list.map((x) => (x.id === id ? { ...x, stockQty: before } : x)));
      setToast({ ok: false, text: `Couldn't update the stock of “${p.name}”. Please try again.` });
      return false;
    }
    setToast({ ok: true, text: `Stock of “${p.name}” is now ${newQty}${p.unit ? ` ${p.unit}` : ""}.` });
    router.refresh();
    return true;
  }

  const cols = TABLE_COLS.filter((c) => show(c.key));
  const tableMinW = cols.reduce((s, c) => s + c.base, 0);
  const showSelect = show("p2-c-select");
  const cardKeys = ["p2-k-total", "p2-k-published", "p2-k-low", "p2-k-out"].filter(show);
  const filterKeys = ["p2-f-status", "p2-f-stock", "p2-f-category", "p2-f-type", "p2-f-item"].filter(show);

  return (
    // Invisible until the saved Display Options are read, so hidden parts never flash in.
    <div className={cn("space-y-5", !loaded && "invisible")}>
      {/* ── stat cards (click to filter) ── */}
      {show("p2-cards") && cardKeys.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {show("p2-k-total") && (
            <StatCard icon={ShoppingBag} tint="bg-orange-50 text-orange-500" value={stats.total} label="Total Products"
              active={!filtersActive} onClick={() => setFilters(EMPTY_PRODUCTS2_FILTERS)} />
          )}
          {show("p2-k-published") && (
            <StatCard icon={BadgeCheck} tint="bg-emerald-50 text-emerald-500" value={stats.published} label="Published"
              active={filters.status === "active"} onClick={() => setFilter("status", filters.status === "active" ? "all" : "active")} />
          )}
          {show("p2-k-low") && (
            <StatCard icon={TriangleAlert} tint="bg-amber-50 text-amber-500" value={stats.low} label={`Low Stock (≤ ${LOW_STOCK_LIMIT})`}
              active={filters.stock === "low"} onClick={() => setFilter("stock", filters.stock === "low" ? "all" : "low")} />
          )}
          {show("p2-k-out") && (
            <StatCard icon={PackageX} tint="bg-red-50 text-red-500" value={stats.out} label="Out of Stock"
              active={filters.stock === "out"} onClick={() => setFilter("stock", filters.stock === "out" ? "all" : "out")} />
          )}
        </div>
      )}

      {/* ── filters (all live) ── */}
      {show("p2-filters") && filterKeys.length > 0 && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {show("p2-f-status") && (
              <FilterSelect icon={CircleDot} label="Status" value={filters.status} onChange={(v) => setFilter("status", v as Products2Filters["status"])}
                dot={filters.status === "active" ? "bg-emerald-500" : filters.status === "inactive" ? "bg-admin-gray-400" : undefined}>
                <option value="all">All Status</option>
                <option value="active">Published</option>
                <option value="inactive">Unpublished</option>
              </FilterSelect>
            )}
            {show("p2-f-stock") && (
              <FilterSelect icon={Boxes} label="Stock" value={filters.stock} onChange={(v) => setFilter("stock", v as Products2Filters["stock"])}
                dot={filters.stock === "in" ? "bg-emerald-500" : filters.stock === "low" ? "bg-amber-500" : filters.stock === "out" ? "bg-red-500" : undefined}>
                <option value="all">All Stock</option>
                <option value="in">In Stock</option>
                <option value="low">Low Stock (≤ {LOW_STOCK_LIMIT})</option>
                <option value="out">Out of Stock</option>
              </FilterSelect>
            )}
            {show("p2-f-category") && (
              <FilterSelect icon={FolderTree} label="Category" value={filters.category} onChange={(v) => setFilter("category", v)}>
                <option value="all">All Categories</option>
                {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                {(hasUncategorized || filters.category === "none") && <option value="none">Uncategorized</option>}
              </FilterSelect>
            )}
            {show("p2-f-type") && (
              <FilterSelect icon={Tag} label="Type" value={filters.type} onChange={(v) => setFilter("type", v)}>
                <option value="all">All Types</option>
                <option value="none">None</option>
                {badges.filter((b) => b.slug !== "none").map((b) => <option key={b.slug} value={b.slug}>{b.label}</option>)}
              </FilterSelect>
            )}
            {show("p2-f-item") && (
              <FilterSelect icon={LayoutGrid} label="Item Type" value={filters.item} onChange={(v) => setFilter("item", v)}>
                <option value="all">All Item Types</option>
                <option value="normal">Normal</option>
                {itemTypes.filter((t) => t.slug !== "normal").map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
              </FilterSelect>
            )}
          </div>
        </section>
      )}

      {/* ── products table (same look and size as the Sales History ledger) ── */}
      {show("p2-table") && (
      <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
        {/* Show [20] entries · Select All · Bulk Actions ··········· Clear filters */}
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-admin-gray-800">
          <label className="flex items-center gap-2">
            Show
            <span className="relative">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Entries per page"
                className="h-9 w-[88px] appearance-none rounded-[0.5rem] border border-admin-gray-200 bg-white pl-3 pr-8 text-sm focus:border-admin-primary focus:outline-none"
              >
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                <option value={0}>All</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-600" />
            </span>
            entries
          </label>

          {showSelect && (
            <>
              <span className="hidden h-6 w-px bg-admin-gray-200 sm:block" />
              <label className="flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={(e) => selectMany(filtered.map((p) => p.id), e.target.checked)}
                  className="h-4 w-4 rounded border-admin-gray-300 accent-[#2563eb]"
                />
                Select All ({selected.size})
              </label>

              <ActionMenu
                label="Bulk Actions"
                title={selected.size === 0 ? "Select products first" : undefined}
                disabled={selected.size === 0}
                trigger={<><Layers className="h-3.5 w-3.5" /> Bulk Actions</>}
                items={[
                  { label: `Publish (${selected.size})`, onClick: () => setStatus(selectedIds, "active") },
                  { label: `Unpublish (${selected.size})`, onClick: () => setStatus(selectedIds, "inactive") },
                  { label: `Print Barcodes (${selected.size})`, onClick: () => printBarcodes(selectedIds) },
                  { label: `Delete (${selected.size})`, danger: true, onClick: () => setConfirm({ ids: selectedIds, label: `${selected.size} selected product${selected.size === 1 ? "" : "s"}` }) },
                ]}
              />
              {selected.size > 0 && (
                <button type="button" onClick={() => setSelected(new Set())} className="text-[13px] text-admin-gray-500 hover:text-admin-gray-800 hover:underline">
                  Clear selection
                </button>
              )}
            </>
          )}

          {filtersActive && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_PRODUCTS2_FILTERS)}
              className="ml-auto flex items-center gap-1 text-[13px] font-medium text-orange-600 hover:underline"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>

        {cols.length === 0 ? (
          <p className="py-10 text-center text-sm text-admin-gray-400">All table columns are hidden — turn them on from Display Options.</p>
        ) : (
        <div className="overflow-x-auto" style={{ minHeight: pageSize === 0 ? undefined : HEAD_H + Math.min(pageSize, MIN_ROWS) * ROW_H }}>
          <table className="w-full table-fixed border-collapse text-[14px]" style={{ minWidth: tableMinW }}>
            <colgroup>
              {/* Narrower columns under 1500px so Name keeps room on laptops. */}
              {cols.map((c) => <col key={c.key} className={c.width} />)}
            </colgroup>
            <thead>
              <tr className="bg-[#f8f9fa] text-left font-bold text-admin-gray-900" style={{ height: HEAD_H }}>
                {cols.map((c) =>
                  c.key === "p2-c-select" ? (
                    <th key={c.key} className="border border-[#dee2e6] px-2 min-[1500px]:px-3">
                      <input
                        type="checkbox"
                        checked={pageAllSelected}
                        onChange={(e) => selectMany(pageRows.map((p) => p.id), e.target.checked)}
                        aria-label="Select products on this page"
                        className="h-4 w-4 rounded border-admin-gray-300 accent-[#2563eb]"
                      />
                    </th>
                  ) : c.sort ? (
                    <SortTh key={c.key} label={c.label} k={c.sort} sort={sort} onSort={toggleSort} />
                  ) : (
                    <th key={c.key} className="border border-[#dee2e6] px-2 font-bold text-admin-gray-900 min-[1500px]:px-3">{c.label}</th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={cols.length} className="border border-[#dee2e6] py-12 text-center text-admin-gray-400">
                    {products.length === 0 ? (
                      <>No products yet. <Link href="/admin/ecommerce/add-product2" className="font-semibold text-orange-600 hover:underline">Add your first product</Link></>
                    ) : (
                      <>No products match these filters.</>
                    )}
                  </td>
                </tr>
              ) : (
                pageRows.map((p) => {
                  const busy = busyIds.has(p.id);
                  const badge = badgeBySlug.get(p.badgeTag);
                  const isSel = selected.has(p.id);
                  const editHref = `/admin/ecommerce/add-product2?edit=${p.id}`;
                  return (
                    <tr
                      key={p.id}
                      style={{ height: ROW_H }}
                      className={cn(
                        isSel ? "bg-blue-50/60" : "odd:bg-[#f2f2f2] even:bg-white",
                        busy && "opacity-60"
                      )}
                    >
                      {show("p2-c-select") && (
                        <td className="px-2 min-[1500px]:px-3 border border-[#dee2e6]">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggle(p.id)}
                            aria-label={`Select ${p.name}`}
                            className="h-4 w-4 rounded border-admin-gray-300 accent-[#2563eb]"
                          />
                        </td>
                      )}
                      {show("p2-c-image") && (
                        <td className="px-1.5 min-[1500px]:px-2 border border-[#dee2e6]">
                          <Link href={editHref} tabIndex={-1} aria-hidden="true" className="block w-9">
                            {p.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/${p.image}`} alt="" loading="lazy" className="h-9 w-9 rounded-md border border-admin-gray-100 bg-white object-cover" />
                            ) : (
                              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-admin-gray-100 bg-admin-gray-50 text-admin-gray-300">
                                <ImageIcon className="h-4 w-4" />
                              </span>
                            )}
                          </Link>
                        </td>
                      )}
                      {show("p2-c-name") && (
                        <td className="px-2 min-[1500px]:px-3 border border-[#dee2e6]">
                          <Link href={editHref} title={`Open ${p.name}`} className="block truncate font-medium text-admin-gray-900 hover:text-admin-primary hover:underline">
                            {p.name}
                          </Link>
                          {/* Stock moves under the name only while the Stock column is hidden. */}
                          {!show("p2-c-stock") && <StockNote p={p} />}
                        </td>
                      )}
                      {show("p2-c-stock") && (
                        <td className="px-2 min-[1500px]:px-3 border border-[#dee2e6]">
                          <StockCell p={p} busy={busy} onSave={(q) => saveStock(p.id, q)} />
                        </td>
                      )}
                      {show("p2-c-category") && (
                        <td className="px-2 min-[1500px]:px-3 border border-[#dee2e6]">
                          {p.categoryName ? (
                            <button
                              type="button"
                              onClick={() => setFilter("category", String(p.categoryId))}
                              title={`Show only ${p.categoryName}`}
                              className="block max-w-full truncate text-left text-admin-gray-700 hover:text-[#2563eb] hover:underline"
                            >
                              {p.categoryName}
                            </button>
                          ) : (
                            <span className="text-admin-gray-400">—</span>
                          )}
                        </td>
                      )}
                      {show("p2-c-price") && (
                        <td className="whitespace-nowrap px-2 min-[1500px]:px-3 border border-[#dee2e6]">
                          <div className="text-admin-gray-900">{money(effectivePrice(p))}</div>
                          {hasSale(p) && <div className="text-[11px] text-admin-gray-400 line-through">{money(p.price)}</div>}
                        </td>
                      )}
                      {show("p2-c-status") && (
                        <td className="px-2 min-[1500px]:px-3 border border-[#dee2e6]">
                          <StatusPill label={`Change status of ${p.name}`} value={p.status === "active" ? "active" : "inactive"} options={PRODUCT_STATUS} disabled={busy} onChange={(next) => setStatus([p.id], next)} />
                        </td>
                      )}
                      {show("p2-c-type") && (
                        <td className="px-2 min-[1500px]:px-3 border border-[#dee2e6]">
                          {p.badgeTag === "none" || !badge ? (
                            <span className="text-admin-gray-500">{typeLabel(p.badgeTag)}</span>
                          ) : (
                            <span className="inline-flex max-w-full items-center gap-1.5 truncate text-admin-gray-800">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: badge.color || "#6b7280" }} />
                              {badge.label}
                            </span>
                          )}
                        </td>
                      )}
                      {show("p2-c-item") && <td className="truncate px-2 text-admin-gray-700 min-[1500px]:px-3 border border-[#dee2e6]">{itemLabel(p.itemType)}</td>}
                      {show("p2-c-actions") && (
                        <td className="px-2 min-[1500px]:px-3 border border-[#dee2e6]">
                          <div className="flex gap-[0.4rem]">
                            <IconAction tone="print" href={`/admin/ecommerce/barcode-print?ids=${p.id}`} target="_blank" rel="noreferrer" title={`Print barcode for ${p.name}`}><Barcode /></IconAction>
                            <IconAction tone="edit" href={editHref} title={`Edit ${p.name}`}><SquarePen /></IconAction>
                            <IconAction tone="delete" disabled={busy} onClick={() => setConfirm({ ids: [p.id], label: `“${p.name}”` })} title={`Delete ${p.name}`}><Trash2 /></IconAction>
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
            {filtered.length === 0
              ? "Showing 0 entries"
              : `Showing ${start + 1} to ${start + pageRows.length} of ${filtered.length} entries`}
            {filtered.length !== products.length && ` (filtered from ${products.length} total entries)`}
          </span>
          {pageCount > 1 && <Pager page={current} pageCount={pageCount} onPage={setPage} label="Product pages" />}
        </div>
      </section>
      )}

      {confirm && (
        <ConfirmDelete label={confirm.label} count={confirm.ids.length} onCancel={() => setConfirm(null)} onConfirm={() => deleteProducts(confirm.ids)} />
      )}
      {toast && <Toast ok={toast.ok} text={toast.text} onClose={() => setToast(null)} />}
    </div>
  );
}

/**
 * Table columns in order. `width` is the Tailwind width (narrower under
 * 1500px so Name keeps room on laptops); `base` is the narrow width in px,
 * used to size the table's minimum width from whichever columns are shown.
 */
const TABLE_COLS: { key: string; label: string; width?: string; base: number; sort?: SortKey }[] = [
  { key: "p2-c-select", label: "", width: "w-[36px] min-[1500px]:w-[44px]", base: 36 },
  { key: "p2-c-image", label: "Image", width: "w-[52px] min-[1500px]:w-[58px]", base: 52 },
  { key: "p2-c-name", label: "Name", base: 180, sort: "name" },
  { key: "p2-c-stock", label: "Stock", width: "w-[96px] min-[1500px]:w-[112px]", base: 96, sort: "stock" },
  { key: "p2-c-category", label: "Category", width: "w-[114px] min-[1500px]:w-[150px]", base: 114, sort: "category" },
  { key: "p2-c-price", label: "Price", width: "w-[96px] min-[1500px]:w-[120px]", base: 96, sort: "price" },
  { key: "p2-c-status", label: "Status", width: "w-[140px] min-[1500px]:w-[150px]", base: 140, sort: "status" },
  { key: "p2-c-type", label: "Type", width: "w-[100px] min-[1500px]:w-[116px]", base: 100, sort: "type" },
  { key: "p2-c-item", label: "Item Type", width: "w-[96px] min-[1500px]:w-[124px]", base: 96, sort: "item" },
  { key: "p2-c-actions", label: "Actions", width: "w-[142px] min-[1500px]:w-[148px]", base: 142 },
];

/* ───────────────────────── pieces ───────────────────────── */

/**
 * Stock column: the quantity (red when out, amber when low) and a small +
 * button that opens a quick form to add stock — or set an exact count —
 * right here, without leaving the list. Digital/licence/affiliate products
 * don't track stock, so they show "—".
 */
function StockCell({ p, busy, onSave }: { p: Product2Row; busy: boolean; onSave: (qty: number) => Promise<boolean> }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  if (p.productType !== "physical") {
    return <span className="text-admin-gray-400" title="Stock isn't tracked for this product type">—</span>;
  }
  const qty = p.stockQty ?? 0;
  const tone = isOutOfStock(p) ? "text-red-600" : isLowStock(p) ? "text-amber-600" : "text-admin-gray-900";

  function open() {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const W = 250;
    const H = 214;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    const top = r.bottom + 6 + H > window.innerHeight ? Math.max(8, r.top - 6 - H) : r.bottom + 6;
    setPos({ top, left });
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("truncate", tone)} title={isOutOfStock(p) ? "Out of stock" : isLowStock(p) ? "Low stock" : undefined}>
        <span className="font-semibold">{qty.toLocaleString("en-IN")}</span>
        {p.unit && <span className="ml-1 text-[11px] font-normal text-admin-gray-500">{p.unit}</span>}
      </span>
      <PillButton
        ref={btn}
        variant="success"
        disabled={busy}
        onClick={() => (pos ? setPos(null) : open())}
        aria-haspopup="dialog"
        aria-expanded={!!pos}
        aria-label={`Add stock for ${p.name}`}
        title="Add stock"
        className="shrink-0"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </PillButton>
      {pos && <StockForm p={p} pos={pos} anchor={btn} onClose={() => setPos(null)} onSave={onSave} />}
    </div>
  );
}

function StockForm({ p, pos, anchor, onClose, onSave }: {
  p: Product2Row;
  pos: { top: number; left: number };
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSave: (qty: number) => Promise<boolean>;
}) {
  const current = p.stockQty ?? 0;
  const [mode, setMode] = useState<"add" | "set">("add");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const n = Math.floor(Number(value));
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= 0 && (mode === "set" || n > 0);
  const next = mode === "add" ? current + (valid ? n : 0) : valid ? n : current;

  useEffect(() => {
    input.current?.focus();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) onClose();
  }

  return createPortal(
    <div ref={box} role="dialog" aria-label={`Update stock — ${p.name}`} className="fixed z-[400] w-[250px] rounded-[0.5rem] border border-admin-gray-200 bg-white p-3 text-[13px] shadow-[0_0.5rem_1.5rem_rgba(0,0,0,.15)]" style={pos}>
      <form onSubmit={submit}>
        <div className="mb-2 truncate font-semibold text-admin-gray-900" title={p.name}>{p.name}</div>
        <div className="mb-2.5 grid grid-cols-2 rounded-[0.5rem] border border-[#e5e7eb] p-0.5">
          {(["add", "set"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                input.current?.focus();
              }}
              aria-pressed={mode === m}
              className={cn("h-7 rounded-[0.375rem] text-xs font-medium transition-colors", mode === m ? "bg-admin-primary text-white" : "text-admin-gray-600 hover:bg-admin-gray-50")}
            >
              {m === "add" ? "Add stock" : "Set exact"}
            </button>
          ))}
        </div>
        <label className="mb-1 block text-xs text-admin-gray-500">{mode === "add" ? "Quantity to add" : "New stock quantity"}{p.unit ? ` (${p.unit})` : ""}</label>
        <input
          ref={input}
          type="number"
          inputMode="numeric"
          min={mode === "add" ? 1 : 0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={mode === "add" ? "Quantity to add" : "New stock quantity"}
          className="h-9 w-full rounded-[0.5rem] border border-[#e5e7eb] px-2.5 text-sm outline-none focus:border-admin-primary focus:shadow-[0_0_0_3px_#f5f3ff]"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-admin-gray-500">
          <span>Now: <b className="text-admin-gray-800">{current}</b></span>
          <span>After: <b className={cn(valid ? "text-emerald-600" : "text-admin-gray-800")}>{next}</b></span>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3 text-xs font-medium text-[#374151] hover:bg-[#f9fafb]">Cancel</button>
          <button type="submit" disabled={!valid || saving} className="flex h-8 items-center gap-1.5 rounded-[0.5rem] bg-admin-primary px-3 text-xs font-semibold text-white hover:bg-admin-primary-dark disabled:cursor-not-allowed disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

/** Small line under the name: stock for physical products. */
function StockNote({ p }: { p: Product2Row }) {
  if (p.productType !== "physical") return null;
  if (isOutOfStock(p)) return <div className="text-[11px] font-medium text-red-500">Out of stock</div>;
  if (isLowStock(p)) return <div className="text-[11px] font-medium text-amber-600">Only {p.stockQty} left</div>;
  return <div className="text-[11px] text-admin-gray-500">Stock {p.stockQty}{p.unit ? ` ${p.unit}` : ""}</div>;
}

function StatCard({ icon: Icon, tint, value, label, active, onClick }: {
  icon: React.ComponentType<{ className?: string }>; tint: string; value: number; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Show ${label.toLowerCase()}`}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3.5 text-left shadow-sm transition-colors sm:gap-4 sm:px-5 sm:py-4",
        active ? "border-orange-300 ring-1 ring-orange-200" : "border-admin-gray-200 hover:border-orange-200"
      )}
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12", tint)}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-tight text-admin-gray-900">{value.toLocaleString("en-IN")}</span>
        <span className="block text-[13px] leading-tight text-admin-gray-600 sm:text-sm">{label}</span>
      </span>
    </button>
  );
}

function FilterSelect({ icon: Icon, label, value, onChange, dot, children }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; onChange: (v: string) => void; dot?: string; children: React.ReactNode;
}) {
  const on = value !== "all";
  return (
    <label
      className={cn(
        "relative flex h-12 min-w-[160px] flex-1 cursor-pointer items-center gap-2.5 rounded-[0.5rem] border pl-3 pr-9 transition-colors focus-within:border-admin-primary focus-within:ring-2 focus-within:ring-admin-primary/15",
        on ? "border-orange-300 bg-orange-50/50" : "border-admin-gray-200 bg-white hover:border-admin-gray-300"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", on ? "text-orange-500" : "text-admin-gray-500")} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs leading-4 text-admin-gray-500">{label}</span>
        <span className="flex items-center gap-1.5">
          {dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />}
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            className="w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent text-sm font-medium leading-5 text-admin-gray-900 focus:outline-none"
          >
            {children}
          </select>
        </span>
      </span>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-500" />
    </label>
  );
}

function SortTh({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  return (
    <th className="whitespace-nowrap border border-[#dee2e6] px-2 font-bold text-admin-gray-900 min-[1500px]:px-3" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className="flex w-full items-center justify-between gap-2">
        {label}
        {active ? (
          sort.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-admin-gray-600" /> : <ArrowDown className="h-3.5 w-3.5 text-admin-gray-600" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-admin-gray-300" />
        )}
      </button>
    </th>
  );
}

function ConfirmDelete({ label, count, onCancel, onConfirm }: { label: string; count: number; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-label="Confirm delete" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h5 className="mb-2 flex items-center gap-2 font-bold text-admin-gray-900">
          <Trash2 className="h-4 w-4 text-red-500" /> Confirm Delete?
        </h5>
        <p className="mb-4 text-sm text-admin-gray-600">
          You are going to delete <strong>{label}</strong>. This can&apos;t be undone.
          {count > 0 && " Products that already appear in orders can't be deleted and will be skipped."}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg bg-admin-gray-100 px-4 py-2 text-sm hover:bg-admin-gray-200">Cancel</button>
          <button type="button" autoFocus onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
            Delete{count > 1 ? ` ${count}` : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Toast({ ok, text, onClose }: { ok: boolean; text: string; onClose: () => void }) {
  return createPortal(
    <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg", ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="flex-1">{text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
    </div>,
    document.body
  );
}
