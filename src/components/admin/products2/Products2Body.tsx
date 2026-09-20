"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ShoppingBag, BadgeCheck, PackageX, Search, CircleDot, Boxes, Tag, LayoutGrid, ChevronDown, ChevronLeft, ChevronRight,
  Layers, Download, Barcode, SquarePen, Trash2, ImageIcon, ChevronsUpDown, ArrowUp, ArrowDown, Loader2, CheckCircle2, AlertCircle, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Products2Filters } from "./filters";

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
  createdAt: string;
}

interface Badge { slug: string; label: string; color: string | null }
interface ItemType { slug: string; label: string }


const ORANGE = "#f97316";
const PAGE_PATH = "/admin/ecommerce/products2";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hasSale = (p: Product2Row) => p.salePrice !== null && p.salePrice > 0 && p.salePrice < p.price;
const effectivePrice = (p: Product2Row) => (hasSale(p) ? (p.salePrice as number) : p.price);
/** Same rule as the Stock Out Products page: a physical product whose stock is empty or not set. */
const isOutOfStock = (p: Product2Row) => p.productType === "physical" && (p.stockQty === null || p.stockQty <= 0);


/* ───────────────────────── page body ───────────────────────── */

type SortKey = "name" | "price" | "status" | "type" | "item" | "created";

export function Products2Body({ products: initial, badges, itemTypes, initialFilters }: {
  products: Product2Row[];
  badges: Badge[];
  itemTypes: ItemType[];
  initialFilters: Products2Filters;
}) {
  const router = useRouter();

  // Local copy so publish/unpublish/delete show instantly; replaced whenever
  // the server sends a fresh list (router.refresh after a change).
  const [products, setProducts] = useState(initial);
  useEffect(() => setProducts(initial), [initial]);

  const [filters, setFilters] = useState<Products2Filters>(initialFilters);
  const deferredQ = useDeferredValue(filters.q);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "created", dir: "desc" });
  const [pageSize, setPageSize] = useState(10); // 0 = All
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<{ ids: number[]; label: string } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const badgeBySlug = useMemo(() => new Map(badges.map((b) => [b.slug, b])), [badges]);
  const itemLabel = (slug: string) => (slug === "normal" ? "Normal" : itemTypes.find((t) => t.slug === slug)?.label ?? slug);
  const typeLabel = (slug: string) => (slug === "none" ? "None" : badgeBySlug.get(slug)?.label ?? slug);

  // Keep the filters in the address bar (no navigation, no reload) so a refresh
  // or a shared link opens the same view.
  useEffect(() => {
    const p = new URLSearchParams();
    if (filters.q.trim()) p.set("q", filters.q.trim());
    if (filters.status !== "all") p.set("status", filters.status);
    if (filters.stock !== "all") p.set("stock", filters.stock);
    if (filters.type !== "all") p.set("type", filters.type);
    if (filters.item !== "all") p.set("item", filters.item);
    const qs = p.toString();
    window.history.replaceState(window.history.state, "", qs ? `${PAGE_PATH}?${qs}` : PAGE_PATH);
  }, [filters]);

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
      outOfStock: products.filter(isOutOfStock).length,
    }),
    [products]
  );

  const filtered = useMemo(() => {
    const term = deferredQ.trim().toLowerCase();
    const list = products.filter((p) => {
      if (filters.status !== "all" && p.status !== filters.status) return false;
      if (filters.stock === "out" && !isOutOfStock(p)) return false;
      if (filters.stock === "in" && isOutOfStock(p)) return false;
      if (filters.type !== "all" && p.badgeTag !== filters.type) return false;
      if (filters.item !== "all" && p.itemType !== filters.item) return false;
      if (term && !`${p.name} ${p.sku ?? ""} ${p.barcode ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const val = (p: Product2Row): string | number => {
      switch (sort.key) {
        case "name": return p.name.toLowerCase();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, filters.status, filters.stock, filters.type, filters.item, deferredQ, sort]);

  // Back to page 1 whenever the result set's definition changes.
  useEffect(() => setPage(1), [filters, sort, pageSize]);
  // Forget selections that are no longer in the list.
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
  const pageRows = pageSize === 0 ? filtered : filtered.slice(start, start + pageSize);

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const pageAllSelected = pageRows.length > 0 && pageRows.every((p) => selected.has(p.id));

  function setFilter<K extends keyof Products2Filters>(key: K, value: Products2Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }
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
  function toggleSort(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "price" ? "desc" : "asc" }));
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

  function exportCsv(list: Product2Row[], label: string) {
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["ID", "Name", "SKU", "Barcode", "Price", "Sale Price", "Stock", "Unit", "Status", "Type", "Item Type"].join(",")];
    for (const p of list) {
      lines.push(
        [p.id, p.name, p.sku, p.barcode, p.price.toFixed(2), p.salePrice === null ? "" : p.salePrice.toFixed(2),
          p.stockQty, p.unit, p.status === "active" ? "Published" : "Unpublished", typeLabel(p.badgeTag), itemLabel(p.itemType)]
          .map(cell)
          .join(",")
      );
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const selectedIds = [...selected];
  const selectedRows = products.filter((p) => selected.has(p.id));
  const filtersActive =
    filters.q.trim() !== "" || filters.status !== "all" || filters.stock !== "all" || filters.type !== "all" || filters.item !== "all";

  return (
    <div className="space-y-5">
      {/* ── stat cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:max-w-[1000px]">
        <StatCard icon={ShoppingBag} tint="bg-orange-50 text-orange-500" value={stats.total} label="Total Products" onClick={() => setFilters({ q: "", status: "all", stock: "all", type: "all", item: "all" })} />
        <StatCard icon={BadgeCheck} tint="bg-emerald-50 text-emerald-500" value={stats.published} label="Published" onClick={() => setFilter("status", "active")} />
        <StatCard icon={PackageX} tint="bg-red-50 text-red-500" value={stats.outOfStock} label="Out of Stock" onClick={() => setFilter("stock", "out")} />
      </div>

      {/* ── filters (all live) ── */}
      <section className="rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            searchRef.current?.blur();
          }}
          className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] min-[1500px]:grid-cols-[minmax(220px,1.6fr)_repeat(4,minmax(150px,1fr))_auto]"
        >
          <div className="relative sm:col-span-2 lg:col-span-full min-[1500px]:col-span-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
            <input
              ref={searchRef}
              type="search"
              value={filters.q}
              onChange={(e) => setFilter("q", e.target.value)}
              placeholder="Search by name, SKU or barcode..."
              aria-label="Search products"
              className="h-12 w-full rounded-lg border border-admin-gray-200 bg-white pl-10 pr-3 text-sm placeholder:text-admin-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/15"
            />
          </div>
          <FilterSelect icon={CircleDot} label="Status" value={filters.status} onChange={(v) => setFilter("status", v as Products2Filters["status"])}
            dot={filters.status === "active" ? "bg-emerald-500" : filters.status === "inactive" ? "bg-admin-gray-400" : undefined}>
            <option value="all">All Status</option>
            <option value="active">Published</option>
            <option value="inactive">Unpublished</option>
          </FilterSelect>
          <FilterSelect icon={Boxes} label="Stock" value={filters.stock} onChange={(v) => setFilter("stock", v as Products2Filters["stock"])}>
            <option value="all">All Stock</option>
            <option value="in">In Stock</option>
            <option value="out">Out of Stock</option>
          </FilterSelect>
          <FilterSelect icon={Tag} label="Type" value={filters.type} onChange={(v) => setFilter("type", v)}>
            <option value="all">All Types</option>
            <option value="none">None</option>
            {badges.filter((b) => b.slug !== "none").map((b) => <option key={b.slug} value={b.slug}>{b.label}</option>)}
          </FilterSelect>
          <FilterSelect icon={LayoutGrid} label="Item Type" value={filters.item} onChange={(v) => setFilter("item", v)}>
            <option value="all">All Item Types</option>
            <option value="normal">Normal</option>
            {itemTypes.filter((t) => t.slug !== "normal").map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
          </FilterSelect>
          {filtersActive ? (
            <button
              type="button"
              onClick={() => setFilters({ q: "", status: "all", stock: "all", type: "all", item: "all" })}
              className="flex h-12 items-center justify-center gap-2 rounded-lg border border-admin-gray-200 bg-white px-5 text-sm font-semibold text-admin-gray-700 transition-colors hover:bg-admin-gray-50"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          ) : (
            <button
              type="submit"
              className="flex h-12 items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: ORANGE }}
            >
              <Search className="h-4 w-4" /> Search
            </button>
          )}
        </form>
      </section>

      {/* ── table card ── */}
      <section className="rounded-xl border border-admin-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer select-none items-center gap-2 pr-2 text-sm text-admin-gray-800">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={(e) => selectMany(filtered.map((p) => p.id), e.target.checked)}
              className="h-4 w-4 rounded border-admin-gray-300 accent-orange-500"
            />
            Select All ({selected.size})
          </label>

          <Menu
            label="Bulk Actions"
            icon={Layers}
            disabled={selected.size === 0}
            items={[
              { label: `Publish (${selected.size})`, onClick: () => setStatus(selectedIds, "active") },
              { label: `Unpublish (${selected.size})`, onClick: () => setStatus(selectedIds, "inactive") },
              { label: `Print Barcodes (${selected.size})`, onClick: () => printBarcodes(selectedIds) },
              { label: `Delete (${selected.size})`, danger: true, onClick: () => setConfirm({ ids: selectedIds, label: `${selected.size} selected product${selected.size === 1 ? "" : "s"}` }) },
            ]}
          />
          <Menu
            label="Export"
            icon={Download}
            items={[
              { label: `Shown products (${filtered.length}) — CSV`, onClick: () => exportCsv(filtered, "filtered"), disabled: filtered.length === 0 },
              { label: `Selected products (${selected.size}) — CSV`, onClick: () => exportCsv(selectedRows, "selected"), disabled: selected.size === 0 },
              { label: `All products (${products.length}) — CSV`, onClick: () => exportCsv(products, "all"), disabled: products.length === 0 },
            ]}
          />

          <label className="ml-auto flex items-center gap-2 text-sm text-admin-gray-800">
            Show
            <span className="relative">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Products per page"
                className="h-10 w-[92px] appearance-none rounded-lg border border-admin-gray-200 bg-white pl-3 pr-8 text-sm focus:border-orange-400 focus:outline-none"
              >
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                <option value={0}>All</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-600" />
            </span>
            entries
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border border-admin-gray-100" style={{ minHeight: pageSize === 0 ? undefined : HEAD_H + Math.min(pageSize, 10) * ROW_H }}>
          <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
            <colgroup>
              {/* Narrower columns under 1500px so Name keeps room on laptops. */}
              <col className="w-[44px] min-[1500px]:w-[52px]" />
              <col className="w-[76px] min-[1500px]:w-[96px]" />
              <col />
              <col className="w-[120px] min-[1500px]:w-[150px]" />
              <col className="w-[136px] min-[1500px]:w-[150px]" />
              <col className="w-[116px] min-[1500px]:w-[130px]" />
              <col className="w-[120px] min-[1500px]:w-[150px]" />
              <col className="w-[160px] min-[1500px]:w-[170px]" />
            </colgroup>
            <thead className="bg-admin-gray-50">
              <tr style={{ height: HEAD_H }} className="text-left text-[15px] font-semibold text-admin-gray-900">
                <th className="px-3 min-[1500px]:px-4">
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    onChange={(e) => selectMany(pageRows.map((p) => p.id), e.target.checked)}
                    aria-label="Select products on this page"
                    className="h-4 w-4 rounded border-admin-gray-300 accent-orange-500"
                  />
                </th>
                <th className="px-3 font-semibold">Image</th>
                <SortTh label="Name" k="name" sort={sort} onSort={toggleSort} />
                <SortTh label="Price" k="price" sort={sort} onSort={toggleSort} />
                <SortTh label="Status" k="status" sort={sort} onSort={toggleSort} />
                <SortTh label="Type" k="type" sort={sort} onSort={toggleSort} />
                <SortTh label="Item Type" k="item" sort={sort} onSort={toggleSort} />
                <th className="px-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-admin-gray-400">
                    {products.length === 0 ? (
                      <>No products yet. <Link href="/admin/ecommerce/products/add" className="font-semibold text-orange-600 hover:underline">Add your first product</Link></>
                    ) : (
                      <>No products match these filters.</>
                    )}
                  </td>
                </tr>
              ) : (
                pageRows.map((p) => {
                  const busy = busyIds.has(p.id);
                  const badge = badgeBySlug.get(p.badgeTag);
                  return (
                    <tr key={p.id} style={{ height: ROW_H }} className={cn("border-t border-admin-gray-100", selected.has(p.id) ? "bg-orange-50/50" : "hover:bg-admin-gray-50/60", busy && "opacity-60")}>
                      <td className="px-3 min-[1500px]:px-4">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                          aria-label={`Select ${p.name}`}
                          className="h-4 w-4 rounded border-admin-gray-300 accent-orange-500"
                        />
                      </td>
                      <td className="px-3">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/${p.image}`} alt="" loading="lazy" className="h-12 w-12 rounded-md border border-admin-gray-100 object-cover min-[1500px]:h-14 min-[1500px]:w-14" />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-md border border-admin-gray-100 bg-admin-gray-50 text-admin-gray-300 min-[1500px]:h-14 min-[1500px]:w-14">
                            <ImageIcon className="h-5 w-5" />
                          </span>
                        )}
                      </td>
                      <td className="px-3">
                        <div className="line-clamp-2 text-[15px] leading-snug text-admin-gray-900" title={p.name}>{p.name}</div>
                        {isOutOfStock(p) && <div className="mt-0.5 text-xs font-medium text-red-500">Out of stock</div>}
                      </td>
                      <td className="whitespace-nowrap px-3">
                        <div className="text-[15px] font-semibold text-admin-gray-900">{money(effectivePrice(p))}</div>
                        {hasSale(p) && <div className="text-[13px] text-admin-gray-400 line-through">{money(p.price)}</div>}
                      </td>
                      <td className="px-3">
                        <StatusMenu
                          status={p.status}
                          busy={busy}
                          onChange={(s) => s !== p.status && setStatus([p.id], s)}
                        />
                      </td>
                      <td className="px-3">
                        {p.badgeTag === "none" || !badge ? (
                          <span className="text-admin-gray-600">{typeLabel(p.badgeTag)}</span>
                        ) : (
                          <span className="inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: badge.color || "#6b7280" }}>
                            {badge.label}
                          </span>
                        )}
                      </td>
                      <td className="truncate px-3 text-admin-gray-800">{itemLabel(p.itemType)}</td>
                      <td className="px-3">
                        <div className="flex items-center gap-1.5 min-[1500px]:gap-2">
                          <a
                            href={`/admin/ecommerce/barcode-print?ids=${p.id}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Print barcode"
                            aria-label={`Print barcode for ${p.name}`}
                            className="flex h-9 w-10 items-center justify-center rounded-md min-[1500px]:h-10 min-[1500px]:w-11 bg-slate-500 text-white shadow-sm transition-colors hover:bg-slate-600"
                          >
                            <Barcode className="h-4 w-4" />
                          </a>
                          <Link
                            href={`/admin/ecommerce/products/add?edit=${p.id}`}
                            title="Edit"
                            aria-label={`Edit ${p.name}`}
                            className="flex h-9 w-10 items-center justify-center rounded-md min-[1500px]:h-10 min-[1500px]:w-11 text-white shadow-sm transition-opacity hover:opacity-90"
                            style={{ backgroundColor: ORANGE }}
                          >
                            <SquarePen className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirm({ ids: [p.id], label: `“${p.name}”` })}
                            title="Delete"
                            aria-label={`Delete ${p.name}`}
                            className="flex h-9 w-10 items-center justify-center rounded-md min-[1500px]:h-10 min-[1500px]:w-11 bg-red-500 text-white shadow-sm transition-colors hover:bg-red-600 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-3 text-sm text-admin-gray-700">
          <span>
            {filtered.length === 0
              ? "Showing 0 products"
              : `Showing ${start + 1} to ${start + pageRows.length} of ${filtered.length} products`}
            {filtered.length !== products.length && <span className="text-admin-gray-400"> (filtered from {products.length})</span>}
          </span>
          {pageCount > 1 && <Pager page={current} pageCount={pageCount} onPage={setPage} />}
        </div>
      </section>

      {confirm && (
        <ConfirmDelete label={confirm.label} count={confirm.ids.length} onCancel={() => setConfirm(null)} onConfirm={() => deleteProducts(confirm.ids)} />
      )}
      {toast && <Toast ok={toast.ok} text={toast.text} onClose={() => setToast(null)} />}
    </div>
  );
}

/** Row and header heights (px). Fixed, so filtering never makes the table jump. */
const ROW_H = 76;
const HEAD_H = 54;

/* ───────────────────────── pieces ───────────────────────── */

function StatCard({ icon: Icon, tint, value, label, onClick }: {
  icon: React.ComponentType<{ className?: string }>; tint: string; value: number; label: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Show ${label.toLowerCase()}`}
      className="flex items-center gap-4 rounded-xl border border-admin-gray-200 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:border-orange-200"
    >
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tint)}>
        <Icon className="h-6 w-6" />
      </span>
      <span>
        <span className="block text-2xl font-bold leading-tight text-admin-gray-900">{value.toLocaleString("en-IN")}</span>
        <span className="block text-sm text-admin-gray-600">{label}</span>
      </span>
    </button>
  );
}

function FilterSelect({ icon: Icon, label, value, onChange, dot, children }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; onChange: (v: string) => void; dot?: string; children: React.ReactNode;
}) {
  return (
    <label className="relative flex h-12 min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-admin-gray-200 bg-white pl-3 pr-9 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/15">
      <Icon className="h-4 w-4 shrink-0 text-admin-gray-600" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs leading-4 text-admin-gray-800">{label}</span>
        <span className="flex items-center gap-1.5">
          {dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />}
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            className="w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent text-sm leading-5 text-admin-gray-900 focus:outline-none"
          >
            {children}
          </select>
        </span>
      </span>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-600" />
    </label>
  );
}

function SortTh({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  return (
    <th className="px-3 font-semibold" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className="flex w-full items-center justify-between gap-2">
        {label}
        {active ? (
          sort.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-admin-gray-700" /> : <ArrowDown className="h-3.5 w-3.5 text-admin-gray-700" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-admin-gray-300" />
        )}
      </button>
    </th>
  );
}

/**
 * Publish / Unpublish pill. Its menu is portalled to <body> with fixed
 * coordinates so the table's scroll container can't clip it.
 */
function StatusMenu({ status, busy, onChange }: { status: string; busy: boolean; onChange: (s: "active" | "inactive") => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const active = status === "active";

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !menu.current?.contains(t)) setPos(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
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
      <button
        ref={btn}
        type="button"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={() => {
          if (pos) return setPos(null);
          const r = btn.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 4, left: r.left });
        }}
        className={cn(
          "flex h-9 w-[112px] items-center justify-between min-[1500px]:w-[118px] rounded-md px-3 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-wait",
          active ? "bg-emerald-500 hover:bg-emerald-600" : "bg-admin-gray-400 hover:bg-admin-gray-500"
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? "Publish" : "Unpublish"}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {pos &&
        createPortal(
          <div ref={menu} role="menu" className="fixed z-[400] w-[140px] rounded-lg border border-admin-gray-200 bg-white py-1 text-sm shadow-lg" style={pos}>
            {(["active", "inactive"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={status === s}
                onClick={() => {
                  setPos(null);
                  onChange(s);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-admin-gray-50"
              >
                <span className={cn("h-2 w-2 rounded-full", s === "active" ? "bg-emerald-500" : "bg-admin-gray-400")} />
                {s === "active" ? "Publish" : "Unpublish"}
                {status === s && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-500" />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

function Menu({ label, icon: Icon, items, disabled }: {
  label: string; icon: React.ComponentType<{ className?: string }>; disabled?: boolean;
  items: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={disabled ? "Select products first" : undefined}
        className="flex h-10 items-center gap-2 rounded-lg border border-admin-gray-200 bg-admin-gray-50 px-4 text-sm font-medium text-admin-gray-800 transition-colors hover:bg-admin-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon className="h-4 w-4" /> {label} <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1.5 min-w-[230px] rounded-lg border border-admin-gray-200 bg-white py-1 text-sm shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={cn(
                "block w-full px-3.5 py-2 text-left hover:bg-admin-gray-50 disabled:cursor-not-allowed disabled:text-admin-gray-300 disabled:hover:bg-transparent",
                it.danger ? "text-red-600" : "text-admin-gray-800"
              )}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Previous · 1 2 3 … · Next */
function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const base = "flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm transition-colors";
  return (
    <nav className="flex items-center gap-2" aria-label="Product pages">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={cn(base, "gap-1.5 border-admin-gray-200 text-admin-gray-800 hover:bg-admin-gray-50 disabled:cursor-not-allowed disabled:opacity-40")}>
        <ChevronLeft className="h-4 w-4" /> Previous
      </button>
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="px-1 text-admin-gray-400">…</span>
        ) : (
          <button
            key={n}
            type="button"
            aria-current={n === page ? "page" : undefined}
            onClick={() => onPage(n)}
            className={cn(base, n === page ? "border-transparent text-white" : "border-admin-gray-200 text-admin-gray-800 hover:bg-admin-gray-50")}
            style={n === page ? { backgroundColor: ORANGE } : undefined}
          >
            {n}
          </button>
        )
      )}
      <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)} className={cn(base, "gap-1.5 border-admin-gray-200 text-admin-gray-800 hover:bg-admin-gray-50 disabled:cursor-not-allowed disabled:opacity-40")}>
        Next <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
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
