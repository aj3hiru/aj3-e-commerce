"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Loader2, Package, FolderTree, Tag, FileText, SlidersHorizontal, RotateCcw, Check, ChevronDown, Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";
import type { PushCatalog, PushProductHit, ProductSort, StockFilter } from "@/lib/push-catalog";
import { INPUT, LABEL, Modal, Pager, Thumb, absoluteUrl, rupees, useDebounced } from "./ui";

/* ───────────────────────── shared bits ───────────────────────── */

export function StockBadge({ p }: { p: Pick<PushProductHit, "stockState" | "stockQty"> }) {
  const meta = {
    in: { cls: "bg-emerald-50 text-emerald-700", text: `In stock${p.stockQty !== null ? ` · ${formatInt(p.stockQty)}` : ""}` },
    low: { cls: "bg-amber-50 text-amber-700", text: `Low · ${formatInt(p.stockQty ?? 0)} left` },
    out: { cls: "bg-red-50 text-red-600", text: "Out of stock" },
    untracked: { cls: "bg-admin-gray-100 text-admin-gray-600", text: "Not tracked" },
  }[p.stockState];
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", meta.cls)}>{meta.text}</span>;
}

export function PriceLine({ p, className }: { p: Pick<PushProductHit, "price" | "finalPrice" | "discountPct" | "onCampaign">; className?: string }) {
  return (
    <span className={cn("flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5", className)}>
      <b className="text-admin-gray-900">{rupees(p.finalPrice)}</b>
      {p.discountPct > 0 && <>
        <s className="text-xs text-admin-gray-400">{rupees(p.price)}</s>
        <span className="rounded bg-red-50 px-1.5 text-[11px] font-bold text-red-600">{p.discountPct}% OFF</span>
      </>}
      {p.onCampaign && <span className="flex items-center gap-0.5 rounded bg-violet-50 px-1.5 text-[11px] font-semibold text-violet-700"><Megaphone className="h-3 w-3" />Campaign</span>}
    </span>
  );
}

/* ───────────────────────── Product picker ───────────────────────── */

interface ProductFilterState {
  q: string; categoryId: string; subcategoryId: string; brandId: string; stock: StockFilter;
  onSale: boolean; minPrice: string; maxPrice: string; sort: ProductSort;
}
const EMPTY_FILTERS: ProductFilterState = {
  q: "", categoryId: "", subcategoryId: "", brandId: "", stock: "all", onSale: false, minPrice: "", maxPrice: "", sort: "newest",
};
const STOCK_CHIPS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "All" }, { value: "in", label: "In stock" }, { value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" },
];
const SORTS: { value: ProductSort; label: string }[] = [
  { value: "newest", label: "Newest first" }, { value: "discount", label: "Biggest discount" },
  { value: "price_asc", label: "Price: low to high" }, { value: "price_desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" }, { value: "stock_low", label: "Lowest stock first" },
];

/**
 * Find the product to promote: live search (name / SKU / barcode) with
 * category → subcategory, brand, stock, on-sale and price-range filters,
 * several sort orders and pagination. Prices shown are what a shopper pays
 * right now, including any live campaign.
 */
export function ProductPicker({ catalog, origin, selectedId, onPick, onClose }: {
  catalog: PushCatalog; origin: string; selectedId: number | null;
  onPick: (p: PushProductHit) => void; onClose: () => void;
}) {
  const [f, setF] = useState<ProductFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ products: PushProductHit[]; total: number; pageCount: number; capped: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false); // mobile: filters collapse above the results
  const q = useDebounced(f.q, 300);
  const minPrice = useDebounced(f.minPrice, 500);
  const maxPrice = useDebounced(f.maxPrice, 500);
  const reqId = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<ProductFilterState>) => { setF((x) => ({ ...x, ...patch })); setPage(1); };
  const subcats = useMemo(() => catalog.categories.find((c) => String(c.id) === f.categoryId)?.subcategories ?? [], [catalog, f.categoryId]);
  const activeCount = [f.categoryId, f.brandId, f.stock !== "all", f.onSale, f.minPrice, f.maxPrice].filter(Boolean).length;

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    const id = ++reqId.current;
    const sp = new URLSearchParams({ page: String(page), sort: f.sort, stock: f.stock });
    if (q.trim()) sp.set("q", q.trim());
    if (f.subcategoryId) sp.set("subcategoryId", f.subcategoryId);
    else if (f.categoryId) sp.set("categoryId", f.categoryId);
    if (f.brandId) sp.set("brandId", f.brandId);
    if (f.onSale) sp.set("onSale", "1");
    if (minPrice) sp.set("minPrice", minPrice);
    if (maxPrice) sp.set("maxPrice", maxPrice);
    setLoading(true);
    setError(null);
    fetch(`/api/push2/products?${sp}`)
      .then((r) => r.json())
      .then((d) => {
        if (id !== reqId.current) return;
        if (d.success) setData(d); else setError(d.error ?? "Couldn't load products.");
      })
      .catch(() => { if (id === reqId.current) setError("Couldn't load products."); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [q, f.categoryId, f.subcategoryId, f.brandId, f.stock, f.onSale, f.sort, minPrice, maxPrice, page]);

  const filters = (
    <div className="space-y-4">
      <div>
        <label htmlFor="pp-cat" className={LABEL}>Category</label>
        <select id="pp-cat" value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value, subcategoryId: "" })} className={INPUT}>
          <option value="">All categories</option>
          {catalog.categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({formatInt(c.productCount)})</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="pp-sub" className={LABEL}>Subcategory</label>
        <select id="pp-sub" value={f.subcategoryId} onChange={(e) => set({ subcategoryId: e.target.value })} disabled={subcats.length === 0}
          className={cn(INPUT, "disabled:bg-admin-gray-50 disabled:text-admin-gray-400")}>
          <option value="">{f.categoryId ? (subcats.length ? "All subcategories" : "No subcategories") : "Pick a category first"}</option>
          {subcats.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatInt(s.productCount)})</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="pp-brand" className={LABEL}>Brand</label>
        <select id="pp-brand" value={f.brandId} onChange={(e) => set({ brandId: e.target.value })} className={INPUT}>
          <option value="">All brands</option>
          {catalog.brands.map((b) => <option key={b.id} value={b.id}>{b.name} ({formatInt(b.productCount)})</option>)}
        </select>
      </div>
      <div>
        <span className={LABEL}>Stock</span>
        <div className="flex flex-wrap gap-1.5">
          {STOCK_CHIPS.map((s) => (
            <button key={s.value} type="button" onClick={() => set({ stock: s.value })} aria-pressed={f.stock === s.value}
              className={cn("h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                f.stock === s.value ? "border-[#2563eb] bg-[#2563eb] text-white" : "border-[#dee2e6] text-admin-gray-700 hover:bg-admin-gray-50")}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[0.375rem] border border-[#dee2e6] px-3 py-2.5">
        <span className="text-sm font-medium text-admin-gray-800">On sale / campaign only</span>
        <input type="checkbox" checked={f.onSale} onChange={(e) => set({ onSale: e.target.checked })} className="h-4 w-4 accent-[#2563eb]" />
      </label>
      <div>
        <span className={LABEL}>Price (what the customer pays)</span>
        <div className="flex items-center gap-2">
          <input type="number" min={0} inputMode="decimal" value={f.minPrice} onChange={(e) => set({ minPrice: e.target.value })} placeholder="Min ₹" aria-label="Minimum price" className={INPUT} />
          <span className="text-admin-gray-400">–</span>
          <input type="number" min={0} inputMode="decimal" value={f.maxPrice} onChange={(e) => set({ maxPrice: e.target.value })} placeholder="Max ₹" aria-label="Maximum price" className={INPUT} />
        </div>
      </div>
      <button type="button" onClick={() => { setF({ ...EMPTY_FILTERS, q: f.q }); setPage(1); }} disabled={activeCount === 0}
        className="flex items-center gap-1.5 text-sm font-medium text-[#2563eb] hover:underline disabled:text-admin-gray-400 disabled:no-underline">
        <RotateCcw className="h-3.5 w-3.5" /> Reset filters
      </button>
    </div>
  );

  return (
    <Modal title="Select a product to promote" onClose={onClose} size="xl">
      <div className="grid min-h-full grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-admin-gray-100 bg-admin-gray-50/60 p-4 md:border-b-0 md:border-r">
          <button type="button" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}
            className="flex w-full items-center gap-2 text-sm font-semibold text-admin-gray-800 md:hidden">
            <SlidersHorizontal className="h-4 w-4" /> Filters {activeCount > 0 && <span className="rounded-full bg-[#2563eb] px-2 text-xs text-white">{activeCount}</span>}
            <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", filtersOpen && "rotate-180")} />
          </button>
          <div className={cn("mt-4 md:mt-0 md:block", filtersOpen ? "block" : "hidden")}>{filters}</div>
        </aside>

        <section className="flex min-w-0 flex-col p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
              <input ref={searchRef} type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search name, SKU or barcode…"
                aria-label="Search products" className={cn(INPUT, "pl-9")} />
            </div>
            <select value={f.sort} onChange={(e) => set({ sort: e.target.value as ProductSort })} aria-label="Sort products" className={cn(INPUT, "w-auto")}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="mb-3 flex items-center justify-between text-xs text-admin-gray-500">
            <span>{data ? `${formatInt(data.total)} product${data.total === 1 ? "" : "s"}${data.capped ? " (first 2,000 matches — narrow the filters)" : ""}` : " "}</span>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-[#2563eb]" />}
          </div>

          {error ? <div className="py-12 text-center text-sm text-red-600">{error}</div>
            : data && data.products.length === 0 && !loading ? (
              <div className="py-12 text-center text-sm text-admin-gray-500"><Package className="mx-auto mb-2 h-8 w-8 opacity-40" />No products match these filters.</div>
            ) : (
              <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3", loading && "opacity-60")}>
                {(data?.products ?? []).map((p) => (
                  <button key={p.id} type="button" onClick={() => onPick(p)}
                    className={cn("group relative flex gap-3 rounded-[0.5rem] border p-2.5 text-left transition-all hover:border-[#2563eb] hover:shadow-md",
                      p.id === selectedId ? "border-[#2563eb] ring-2 ring-[#2563eb]/20" : "border-admin-gray-200")}>
                    <Thumb src={absoluteUrl(p.image, origin)} className="h-[72px] w-[72px]" icon={Package} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-semibold leading-snug text-admin-gray-900">{p.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-admin-gray-500">
                        {[p.category, p.subcategory].filter(Boolean).join(" › ") || "Uncategorised"}{p.brand ? ` · ${p.brand}` : ""}
                      </span>
                      <PriceLine p={p} className="mt-1 text-sm" />
                      <span className="mt-1 block"><StockBadge p={p} /></span>
                    </span>
                    {p.id === selectedId && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#2563eb] text-white"><Check className="h-3 w-3" /></span>}
                  </button>
                ))}
              </div>
            )}
          {data && <div className="mt-4"><Pager page={Math.min(page, data.pageCount)} pageCount={data.pageCount} onPage={setPage} label="Product pages" /></div>}
        </section>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Category / subcategory picker ───────────────────────── */

export type CategoryPick = { kind: "category" | "subcategory"; id: number; name: string; slug: string; parentName?: string; parentSlug?: string; image: string | null; productCount: number };

export function CategoryPicker({ catalog, origin, onPick, onClose }: {
  catalog: PushCatalog; origin: string; onPick: (c: CategoryPick) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = catalog.categories.filter((c) => !term || c.name.toLowerCase().includes(term) || c.subcategories.some((s) => s.name.toLowerCase().includes(term)));
  return (
    <Modal title="Select a category to promote" onClose={onClose} size="lg">
      <div className="p-4">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
          <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search categories…" aria-label="Search categories" className={cn(INPUT, "pl-9")} />
        </div>
        {list.length === 0 ? <div className="py-10 text-center text-sm text-admin-gray-500">No categories found.</div> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {list.map((c) => (
              <div key={c.id} className="rounded-[0.5rem] border border-admin-gray-200 p-3">
                <button type="button" onClick={() => onPick({ kind: "category", id: c.id, name: c.name, slug: c.slug, image: c.image, productCount: c.productCount })}
                  className="flex w-full items-center gap-3 rounded-[0.375rem] p-1 text-left hover:bg-admin-gray-50">
                  <Thumb src={absoluteUrl(c.image, origin)} className="h-12 w-12" icon={FolderTree} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-admin-gray-900">{c.name}</span>
                    <span className="block text-xs text-admin-gray-500">{formatInt(c.productCount)} products</span>
                  </span>
                </button>
                {c.subcategories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-admin-gray-100 pt-2">
                    {c.subcategories.map((s) => (
                      <button key={s.id} type="button"
                        onClick={() => onPick({ kind: "subcategory", id: s.id, name: s.name, slug: s.slug, parentName: c.name, parentSlug: c.slug, image: c.image, productCount: s.productCount })}
                        className="rounded-full border border-[#dee2e6] px-2.5 py-1 text-xs text-admin-gray-700 transition-colors hover:border-[#2563eb] hover:text-[#2563eb]">
                        {s.name} <span className="text-admin-gray-400">{s.productCount}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ───────────────────────── Brand picker ───────────────────────── */

export type BrandPick = PushCatalog["brands"][number];

export function BrandPicker({ catalog, origin, onPick, onClose }: {
  catalog: PushCatalog; origin: string; onPick: (b: BrandPick) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = catalog.brands.filter((b) => !q.trim() || b.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal title="Select a brand to promote" onClose={onClose} size="lg">
      <div className="p-4">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
          <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brands…" aria-label="Search brands" className={cn(INPUT, "pl-9")} />
        </div>
        {list.length === 0 ? <div className="py-10 text-center text-sm text-admin-gray-500">No brands found.</div> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((b) => (
              <button key={b.id} type="button" onClick={() => onPick(b)}
                className="flex flex-col items-center gap-2 rounded-[0.5rem] border border-admin-gray-200 p-3 text-center transition-all hover:border-[#2563eb] hover:shadow-md">
                <Thumb src={absoluteUrl(b.logo, origin)} className="h-14 w-14" icon={Tag} rounded="rounded-full" />
                <span className="w-full truncate text-sm font-semibold text-admin-gray-900">{b.name}</span>
                <span className="text-xs text-admin-gray-500">{formatInt(b.productCount)} products</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ───────────────────────── Blog post picker (admin_push.php) ───────────────────────── */

export type PostHit = { id: number; title: string; slug: string; image: string | null };

/** The original "Search & Select Post" modal: newest published posts on open,
 *  then searches by title on Enter / the Search button. */
export function PostPicker({ origin, onPick, onClose }: { origin: string; onPick: (p: PostHit) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [posts, setPosts] = useState<PostHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  async function search(term: string) {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetch(`/api/push2/posts?q=${encodeURIComponent(term.trim())}`).then((r) => r.json());
      if (id !== reqId.current) return;
      if (data.success) setPosts(data.posts ?? []);
      else { setPosts([]); setError(data.error ?? "Couldn't load posts."); }
    } catch {
      if (id === reqId.current) { setPosts([]); setError("Couldn't load posts."); }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }
  useEffect(() => { search(""); }, []);

  return (
    <Modal title="Select a blog post" onClose={onClose} size="md">
      <div className="p-4">
        <form className="mb-2 flex" onSubmit={(e) => { e.preventDefault(); search(q); }}>
          <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type title to search..." autoComplete="off" className={cn(INPUT, "rounded-r-none")} />
          <button type="submit" className="flex h-10 shrink-0 items-center gap-1.5 rounded-r-[0.375rem] border border-l-0 border-[#2563eb] px-3 text-sm font-medium text-[#2563eb] hover:bg-blue-50">
            <Search className="h-4 w-4" /> Search
          </button>
        </form>
        {loading && <div className="flex justify-center py-8 text-[#2563eb]"><Loader2 className="h-7 w-7 animate-spin" /></div>}
        {!loading && error && <div className="py-8 text-center text-sm text-red-600">{error}</div>}
        {!loading && !error && posts?.length === 0 && <div className="py-8 text-center text-sm text-admin-gray-500"><FileText className="mx-auto mb-2 h-6 w-6 opacity-50" />No posts found</div>}
        {!loading && !error && posts && posts.length > 0 && (
          <ul>
            {posts.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onPick(p)}
                  className="flex w-full items-center gap-3 border-b border-l-4 border-b-admin-gray-100 border-l-transparent px-3 py-3 text-left transition-colors hover:border-l-[#2563eb] hover:bg-admin-gray-50">
                  <Thumb src={absoluteUrl(p.image, origin)} className="h-[50px] w-[50px]" icon={FileText} />
                  <span className="min-w-0">
                    <span className="mb-0.5 block text-sm font-bold leading-tight text-admin-gray-900">{p.title}</span>
                    <span className="block text-xs text-admin-gray-500">ID: {p.id}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
