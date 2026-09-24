"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownUp, Check, ChevronDown, Loader2, PackageSearch, SlidersHorizontal, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FEED_SORTS, type FeedFilters, type FeedProduct, type FeedResult, type FeedSort } from "@/lib/shop-feed-shared";
import { ProductTile, ProductTileSkeleton } from "./ProductTile";

export interface FeedFacets {
  categories: { slug: string; name: string; image: string | null; count: number }[];
  brands: { id: number; name: string; count: number }[];
}

type Draft = Omit<FeedFilters, "page" | "q">;
const EMPTY: Draft = { cat: [], brand: [], min: null, max: null, rating: null, disc: null, inStock: false, sort: "relevance" };

const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: "Under ₹199", min: null, max: 199 },
  { label: "₹200 – ₹499", min: 200, max: 499 },
  { label: "₹500 – ₹999", min: 500, max: 999 },
  { label: "₹1,000 – ₹1,999", min: 1000, max: 1999 },
  { label: "₹2,000 & above", min: 2000, max: null },
];
const DISCOUNTS = [10, 20, 30, 40, 50, 60, 70];
const RATINGS = [4, 3, 2];

function toQuery(q: string, d: Draft, page?: number): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (d.cat.length) sp.set("cat", d.cat.join(","));
  if (d.brand.length) sp.set("brand", d.brand.join(","));
  if (d.min !== null) sp.set("min", String(d.min));
  if (d.max !== null) sp.set("max", String(d.max));
  if (d.rating !== null) sp.set("rating", String(d.rating));
  if (d.disc !== null) sp.set("disc", String(d.disc));
  if (d.inStock) sp.set("stock", "in");
  if (d.sort !== "relevance") sp.set("sort", d.sort);
  if (page && page > 1) sp.set("page", String(page));
  return sp.toString();
}

const activeCount = (d: Draft) =>
  (d.cat.length ? 1 : 0) + (d.brand.length ? 1 : 0) + (d.min !== null || d.max !== null ? 1 : 0) + (d.rating !== null ? 1 : 0) + (d.disc !== null ? 1 : 0) + (d.inStock ? 1 : 0);

/**
 * Meesho-style "Products For You": a sticky Sort / Category / Brand / Filters
 * bar, bottom sheets for each, removable chips for what's applied, and a
 * two-column (wider on bigger screens) grid that loads more as you scroll.
 * Filters live in the URL, so a filtered view can be shared or reloaded.
 */
export function ProductFeed({ title, initial, filters, facets, wishlisted }: {
  title: string; initial: FeedResult; filters: FeedFilters; facets: FeedFacets; wishlisted: number[];
}) {
  const q = filters.q;
  const [applied, setApplied] = useState<Draft>({ ...EMPTY, ...filters });
  const [items, setItems] = useState<FeedProduct[]>(initial.products);
  const [page, setPage] = useState(initial.page);
  const [pageCount, setPageCount] = useState(initial.pageCount);
  const [total, setTotal] = useState(initial.total);
  const [loading, setLoading] = useState<"replace" | "more" | null>(null);
  const [error, setError] = useState(false);
  const [sheet, setSheet] = useState<null | "sort" | "category" | "brand" | "filters">(null);
  const [wish, setWish] = useState<Set<number>>(() => new Set(wishlisted));
  const req = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);

  const onWish = useCallback((id: number, next: boolean) => setWish((s) => { const n = new Set(s); if (next) n.add(id); else n.delete(id); return n; }), []);

  const load = useCallback(async (d: Draft, p: number, mode: "replace" | "more") => {
    const id = ++req.current;
    setLoading(mode);
    setError(false);
    const res = await fetch(`/api/shop/feed?${toQuery(q, d, p)}`).then((r) => r.json()).catch(() => null);
    if (id !== req.current) return;
    setLoading(null);
    if (!res?.success) { setError(true); return; }
    setItems((prev) => (mode === "replace" ? res.products : [...prev, ...res.products.filter((x: FeedProduct) => !prev.some((y) => y.id === x.id))]));
    setPage(res.page); setPageCount(res.pageCount); setTotal(res.total);
  }, [q]);

  function apply(next: Draft) {
    setApplied(next);
    setSheet(null);
    // Keep the URL in step without a full navigation (header/banners don't need to reload).
    const qs = toQuery(q, next);
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    void load(next, 1, "replace");
    const y = top.current ? top.current.getBoundingClientRect().top + window.scrollY - 8 : 0;
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: "smooth" });
  }

  // Load the next page when the bottom of the grid comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || page >= pageCount) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && !loading) void load(applied, page + 1, "more"); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [page, pageCount, loading, applied, load]);

  const n = activeCount(applied);
  const catName = (slug: string) => facets.categories.find((c) => c.slug === slug)?.name ?? slug;
  const brandName = (id: number) => facets.brands.find((b) => b.id === id)?.name ?? `Brand ${id}`;
  const chips: { key: string; label: string; remove: Draft }[] = [
    ...applied.cat.map((c) => ({ key: `c-${c}`, label: catName(c), remove: { ...applied, cat: applied.cat.filter((x) => x !== c) } })),
    ...applied.brand.map((b) => ({ key: `b-${b}`, label: brandName(b), remove: { ...applied, brand: applied.brand.filter((x) => x !== b) } })),
    ...(applied.min !== null || applied.max !== null ? [{ key: "price", label: applied.max === null ? `₹${applied.min}+` : applied.min === null ? `Under ₹${applied.max}` : `₹${applied.min} – ₹${applied.max}`, remove: { ...applied, min: null, max: null } }] : []),
    ...(applied.disc !== null ? [{ key: "disc", label: `${applied.disc}% off or more`, remove: { ...applied, disc: null } }] : []),
    ...(applied.rating !== null ? [{ key: "rating", label: `${applied.rating}★ & above`, remove: { ...applied, rating: null } }] : []),
    ...(applied.inStock ? [{ key: "stock", label: "In stock", remove: { ...applied, inStock: false } }] : []),
  ];

  const barBtn = "flex min-w-0 items-center justify-center gap-1.5 border-r border-[#e7e5ec] px-1 text-[14px] font-bold text-[#333] last:border-r-0 sm:text-[15px]";

  return (
    <section ref={top} aria-label={title} className="bg-white">
      <h2 className="border-b border-[#e7e5ec] px-4 pb-3 pt-5 text-[22px] font-normal text-[#333] sm:text-[24px]">
        {title} {total > 0 && <span className="text-[13px] text-[#8b8ba3]">({total.toLocaleString("en-IN")})</span>}
      </h2>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-30 bg-white shadow-[0_1px_0_#e7e5ec]">
        <div className="grid h-[52px] grid-cols-4">
          <button type="button" onClick={() => setSheet("sort")} className={barBtn}>
            <ArrowDownUp className="h-4 w-4 shrink-0" /> <span className="truncate">Sort</span>
            {applied.sort !== "relevance" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-storefront-green" />}
          </button>
          <button type="button" onClick={() => setSheet("category")} className={barBtn}>
            <span className="truncate">Category</span>{applied.cat.length > 0 ? <Count n={applied.cat.length} /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
          <button type="button" onClick={() => setSheet("brand")} disabled={facets.brands.length === 0} className={cn(barBtn, "disabled:text-[#bbb]")}>
            <span className="truncate">Brand</span>{applied.brand.length > 0 ? <Count n={applied.brand.length} /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
          <button type="button" onClick={() => setSheet("filters")} className={barBtn}>
            <SlidersHorizontal className="h-4 w-4 shrink-0" /> <span className="truncate">Filters</span>{n > 0 && <Count n={n} />}
          </button>
        </div>
        {chips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-t border-[#e7e5ec] px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chips.map((c) => (
              <button key={c.key} type="button" onClick={() => apply(c.remove)}
                className="flex shrink-0 items-center gap-1 rounded-full border border-storefront-green bg-storefront-green-light px-3 py-1 text-[12px] font-semibold text-storefront-green-dark">
                {c.label} <X className="h-3.5 w-3.5" />
              </button>
            ))}
            <button type="button" onClick={() => apply({ ...EMPTY, sort: applied.sort })} className="shrink-0 px-2 text-[12px] font-bold text-[#d9480f]">Clear all</button>
          </div>
        )}
      </div>

      {/* Grid: 1px lines between tiles, like Meesho */}
      {items.length === 0 && loading !== "replace" ? (
        <div className="px-6 py-16 text-center text-[#666]">
          <PackageSearch className="mx-auto mb-3 h-12 w-12 text-[#c4c4cc]" />
          <p className="mb-1 text-base font-bold text-[#333]">{error ? "Couldn't load products" : "No products found"}</p>
          <p className="mb-5 text-sm">{error ? "Please check your connection and try again." : n > 0 ? "Try removing some filters." : q ? `Nothing matches "${q}".` : "New products are coming soon."}</p>
          {(n > 0 || error) && (
            <button type="button" onClick={() => (error ? load(applied, 1, "replace") : apply({ ...EMPTY, sort: applied.sort }))}
              className="rounded-lg bg-storefront-green px-5 py-2.5 text-sm font-bold text-white">{error ? "Try again" : "Clear filters"}</button>
          )}
        </div>
      ) : (
        <div className={cn("grid grid-cols-2 gap-px bg-[#e7e5ec] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", loading === "replace" && "opacity-60")}>
          {items.map((p, i) => <ProductTile key={p.id} p={p} wished={wish.has(p.id)} onWish={onWish} priority={i < 4} />)}
          {loading === "replace" && items.length === 0 && Array.from({ length: 6 }, (_, i) => <ProductTileSkeleton key={i} />)}
          {loading === "more" && Array.from({ length: 4 }, (_, i) => <ProductTileSkeleton key={`s${i}`} />)}
        </div>
      )}

      <div ref={sentinel} className="py-6 text-center text-[13px] text-[#8b8ba3]">
        {loading === "more" ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-storefront-green" />
          : error && items.length > 0 ? <button type="button" onClick={() => load(applied, page + 1, "more")} className="font-bold text-storefront-green">Couldn&apos;t load more — tap to retry</button>
          : page < pageCount ? <button type="button" onClick={() => load(applied, page + 1, "more")} className="font-bold text-storefront-green">Load more</button>
          : items.length > 0 ? `You've seen all ${total.toLocaleString("en-IN")} products` : null}
      </div>

      {sheet === "sort" && (
        <Sheet title="Sort by" onClose={() => setSheet(null)}>
          <div className="py-1">
            {FEED_SORTS.map((s) => (
              <button key={s.value} type="button" onClick={() => apply({ ...applied, sort: s.value as FeedSort })}
                className="flex w-full items-center justify-between px-5 py-3.5 text-left text-[15px] text-[#333] hover:bg-[#f7f7ff]">
                {s.label}
                <span className={cn("grid h-5 w-5 place-items-center rounded-full border-2", applied.sort === s.value ? "border-storefront-green" : "border-[#bbb]")}>
                  {applied.sort === s.value && <span className="h-2.5 w-2.5 rounded-full bg-storefront-green" />}
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === "category" && (
        <ListSheet title="Category" options={facets.categories.map((c) => ({ value: c.slug, label: c.name, count: c.count, image: c.image }))}
          selected={applied.cat} onClose={() => setSheet(null)} onApply={(cat) => apply({ ...applied, cat })} />
      )}
      {sheet === "brand" && (
        <ListSheet title="Brand" options={facets.brands.map((b) => ({ value: String(b.id), label: b.name, count: b.count }))}
          selected={applied.brand.map(String)} onClose={() => setSheet(null)} onApply={(v) => apply({ ...applied, brand: v.map(Number) })} />
      )}
      {sheet === "filters" && <FiltersSheet value={applied} facets={facets} onClose={() => setSheet(null)} onApply={apply} />}
    </section>
  );
}

function Count({ n }: { n: number }) {
  return <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-storefront-green px-1 text-[11px] font-bold text-white">{n}</span>;
}

/** Bottom sheet on phones, centered dialog on larger screens. */
function Sheet({ title, onClose, children, footer, tall }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; tall?: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { cancelAnimationFrame(r); document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className={cn("fixed inset-0 z-[1200] flex items-end justify-center bg-black/40 transition-opacity sm:items-center sm:p-4", shown ? "opacity-100" : "opacity-0")} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={cn("flex w-full flex-col overflow-hidden rounded-t-[18px] bg-white font-storefront shadow-2xl transition-transform duration-200 sm:max-w-md sm:rounded-2xl",
          tall ? "h-[80vh] sm:h-[70vh]" : "max-h-[82vh]", shown ? "translate-y-0" : "translate-y-full sm:translate-y-4")}>
        <div className="flex items-center justify-between border-b border-[#e7e5ec] px-5 py-3.5">
          <h3 className="text-[17px] font-bold text-[#333]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-[#f1eff5] text-[#333]"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-[#e7e5ec] px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

function SheetFooter({ onClear, onApply }: { onClear: () => void; onApply: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button type="button" onClick={onClear} className="h-11 rounded-lg border border-[#ccc] text-[15px] font-bold text-[#333]">Clear</button>
      <button type="button" onClick={onApply} className="h-11 rounded-lg bg-storefront-green text-[15px] font-bold text-white">Apply</button>
    </div>
  );
}

function CheckRow({ checked, onClick, children, count }: { checked: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onClick}
      className="flex w-full items-center gap-3 px-5 py-3 text-left text-[15px] text-[#333] hover:bg-[#f7f7ff]">
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border-2", checked ? "border-storefront-green bg-storefront-green" : "border-[#bbb]")}>
        {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      {count !== undefined && <span className="text-[13px] text-[#8b8ba3]">{count}</span>}
    </button>
  );
}

function ListSheet({ title, options, selected, onClose, onApply }: {
  title: string; options: { value: string; label: string; count: number; image?: string | null }[]; selected: string[];
  onClose: () => void; onApply: (v: string[]) => void;
}) {
  const [sel, setSel] = useState<string[]>(selected);
  const [find, setFind] = useState("");
  const list = options.filter((o) => !find.trim() || o.label.toLowerCase().includes(find.trim().toLowerCase()));
  const toggle = (v: string) => setSel((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  return (
    <Sheet title={title} onClose={onClose} footer={<SheetFooter onClear={() => setSel([])} onApply={() => onApply(sel)} />}>
      {options.length > 8 && (
        <div className="px-4 pt-3">
          <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Search ${title.toLowerCase()}`}
            className="h-10 w-full rounded-xl border border-[#aaa8b8] px-3 text-sm outline-none focus:border-storefront-green" />
        </div>
      )}
      <div className="py-1">
        {list.length === 0 && <p className="px-5 py-6 text-center text-sm text-[#8b8ba3]">Nothing found</p>}
        {list.map((o) => (
          <CheckRow key={o.value} checked={sel.includes(o.value)} onClick={() => toggle(o.value)} count={o.count}>
            {o.image !== undefined && (
              o.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/${o.image}`} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-storefront-green-light text-xs font-bold text-storefront-green">{o.label.charAt(0)}</span>
            )}
            <span className="truncate">{o.label}</span>
          </CheckRow>
        ))}
      </div>
    </Sheet>
  );
}

type Tab = "category" | "brand" | "price" | "discount" | "rating" | "stock";

/** The two-pane "Filters" sheet: tabs on the left, options on the right. */
function FiltersSheet({ value, facets, onClose, onApply }: { value: Draft; facets: FeedFacets; onClose: () => void; onApply: (d: Draft) => void }) {
  const [d, setD] = useState<Draft>(value);
  const tabs = useMemo(() => ([
    { key: "category", label: "Category", on: d.cat.length > 0, show: facets.categories.length > 0 },
    { key: "brand", label: "Brand", on: d.brand.length > 0, show: facets.brands.length > 0 },
    { key: "price", label: "Price", on: d.min !== null || d.max !== null, show: true },
    { key: "discount", label: "Discount", on: d.disc !== null, show: true },
    { key: "rating", label: "Rating", on: d.rating !== null, show: true },
    { key: "stock", label: "Availability", on: d.inStock, show: true },
  ] as { key: Tab; label: string; on: boolean; show: boolean }[]).filter((t) => t.show), [d, facets]);
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? "price");
  const [minIn, setMinIn] = useState(d.min !== null ? String(d.min) : "");
  const [maxIn, setMaxIn] = useState(d.max !== null ? String(d.max) : "");
  const setPrice = (min: number | null, max: number | null) => { setD((x) => ({ ...x, min, max })); setMinIn(min !== null ? String(min) : ""); setMaxIn(max !== null ? String(max) : ""); };
  const radio = (on: boolean) => (
    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-storefront-green" : "border-[#bbb]")}>{on && <span className="h-2.5 w-2.5 rounded-full bg-storefront-green" />}</span>
  );
  const optCls = "flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] text-[#333] hover:bg-[#f7f7ff]";

  return (
    <Sheet title="Filters" tall onClose={onClose}
      footer={<SheetFooter onClear={() => { setD({ ...EMPTY, sort: d.sort }); setMinIn(""); setMaxIn(""); }} onApply={() => {
        const min = minIn.trim() ? Math.max(0, Number(minIn)) || null : null;
        const max = maxIn.trim() ? Math.max(0, Number(maxIn)) || null : null;
        onApply({ ...d, min, max: min !== null && max !== null && max < min ? min : max });
      }} />}>
      <div className="grid h-full grid-cols-[112px_minmax(0,1fr)]">
        <nav className="overflow-y-auto bg-[#f5f5f8]">
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={cn("relative flex w-full items-center justify-between gap-1 px-3 py-3.5 text-left text-[13px] font-semibold",
                tab === t.key ? "bg-white text-storefront-green-dark before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-storefront-green" : "text-[#555]")}>
              {t.label}{t.on && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-storefront-green" />}
            </button>
          ))}
        </nav>
        <div className="overflow-y-auto">
          {tab === "category" && facets.categories.map((c) => (
            <CheckRow key={c.slug} checked={d.cat.includes(c.slug)} count={c.count}
              onClick={() => setD((x) => ({ ...x, cat: x.cat.includes(c.slug) ? x.cat.filter((y) => y !== c.slug) : [...x.cat, c.slug] }))}>
              <span className="truncate">{c.name}</span>
            </CheckRow>
          ))}
          {tab === "brand" && facets.brands.map((b) => (
            <CheckRow key={b.id} checked={d.brand.includes(b.id)} count={b.count}
              onClick={() => setD((x) => ({ ...x, brand: x.brand.includes(b.id) ? x.brand.filter((y) => y !== b.id) : [...x.brand, b.id] }))}>
              <span className="truncate">{b.name}</span>
            </CheckRow>
          ))}
          {tab === "price" && (
            <div className="py-1">
              {PRICE_PRESETS.map((p) => {
                const on = d.min === p.min && d.max === p.max;
                return <button key={p.label} type="button" onClick={() => (on ? setPrice(null, null) : setPrice(p.min, p.max))} className={optCls}>{radio(on)}{p.label}</button>;
              })}
              <div className="px-4 pb-4 pt-2">
                <p className="mb-2 text-[12px] font-semibold text-[#8b8ba3]">Or enter your own range</p>
                <div className="flex items-center gap-2">
                  <input inputMode="numeric" value={minIn} onChange={(e) => setMinIn(e.target.value.replace(/\D/g, ""))} placeholder="Min ₹" aria-label="Minimum price"
                    className="h-10 w-full min-w-0 rounded-lg border border-[#ccc] px-3 text-sm outline-none focus:border-storefront-green" />
                  <span className="text-[#999]">–</span>
                  <input inputMode="numeric" value={maxIn} onChange={(e) => setMaxIn(e.target.value.replace(/\D/g, ""))} placeholder="Max ₹" aria-label="Maximum price"
                    className="h-10 w-full min-w-0 rounded-lg border border-[#ccc] px-3 text-sm outline-none focus:border-storefront-green" />
                </div>
              </div>
            </div>
          )}
          {tab === "discount" && DISCOUNTS.map((v) => (
            <button key={v} type="button" onClick={() => setD((x) => ({ ...x, disc: x.disc === v ? null : v }))} className={optCls}>{radio(d.disc === v)}{v}% off or more</button>
          ))}
          {tab === "rating" && RATINGS.map((v) => (
            <button key={v} type="button" onClick={() => setD((x) => ({ ...x, rating: x.rating === v ? null : v }))} className={optCls}>
              {radio(d.rating === v)}<span className="flex items-center gap-1">{v}<Star className="h-3.5 w-3.5 fill-[#23bb75] text-[#23bb75]" /> &amp; above</span>
            </button>
          ))}
          {tab === "stock" && (
            <CheckRow checked={d.inStock} onClick={() => setD((x) => ({ ...x, inStock: !x.inStock }))}>Exclude out of stock</CheckRow>
          )}
        </div>
      </div>
    </Sheet>
  );
}
