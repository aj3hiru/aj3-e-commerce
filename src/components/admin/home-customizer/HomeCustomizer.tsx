"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Check, ChevronDown, CircleAlert, Clock, ExternalLink, Eye, EyeOff, Gift, GripVertical, ImageIcon, LayoutGrid,
  Loader2, MapPin, Megaphone, Monitor, Palette, PanelBottom, Plus, RefreshCw, RotateCcw, Rows3, Search, ShoppingBag, Smartphone, Tag,
  Trash2, Truck, Upload, X, Zap, GalleryHorizontal, Info, LayoutList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BLOCK_LABEL, MEESHO, newBlock, type BannerSlide, type HomeBlock, type HomeBlockType, type HomeConfig, type StripIcon } from "@/types/home";
import { LINK_PRESETS, isSafeHref } from "@/types/storefront";

export interface PickCategory { slug: string; name: string; image: string | null }
export interface PickProduct { id: number; name: string; image: string | null }

type Block<T extends HomeBlockType> = Extract<HomeBlock, { type: T }>;

const INPUT = "w-full rounded-md border border-admin-gray-200 bg-white px-3 py-2 text-sm text-admin-gray-800 placeholder:text-admin-gray-400 focus:border-admin-primary focus:outline-none focus:ring-2 focus:ring-admin-primary/15";
const imgSrc = (p: string) => (/^https:/.test(p) ? p : `/${p}`);
const rid = () => Math.random().toString(36).slice(2, 10);

const BLOCK_ICON: Record<HomeBlockType, typeof Rows3> = { banner: GalleryHorizontal, categories: LayoutGrid, products: Rows3, image: ImageIcon, feed: LayoutList };
const BLOCK_HINT: Record<HomeBlockType, string> = {
  banner: "Swipeable offer banners",
  categories: "Round category shortcuts",
  products: "Horizontal row of products",
  image: "A single clickable banner",
  feed: "Endless product grid with Sort / Filters",
};
const STRIP_ICONS: { v: StripIcon; icon: typeof MapPin }[] = [
  { v: "pin", icon: MapPin }, { v: "truck", icon: Truck }, { v: "tag", icon: Tag }, { v: "gift", icon: Gift }, { v: "bolt", icon: Zap }, { v: "clock", icon: Clock },
];
const ACCENTS = [MEESHO.jamun, "#7c3aed", "#e11d48", "#ea580c", "#16a34a", "#0284c7", "#353543"];

/* ───────────────────────── small controls ───────────────────────── */

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-admin-primary" : "bg-admin-gray-300")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold text-admin-gray-700">
      {children}{hint && <span className="font-normal text-admin-gray-400">{hint}</span>}
    </span>
  );
}

function Text({ label, value, onChange, max, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <Label hint={hint ?? `${value.length}/${max}`}>{label}</Label>
      <input value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={INPUT} />
    </label>
  );
}

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1 py-1.5 text-sm text-admin-gray-700 hover:bg-admin-gray-50">
      <span>{children}</span>
      <Switch on={on} onChange={onChange} label={typeof children === "string" ? children : "Toggle"} />
    </label>
  );
}

function ColorInput({ label, value, onChange, swatches }: { label: string; value: string; onChange: (v: string) => void; swatches?: string[] }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-admin-gray-200 bg-white p-0.5" />
        <input value={text} maxLength={7} className={cn(INPUT, "font-mono uppercase")}
          onChange={(e) => { setText(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase()); }} />
      </div>
      {swatches && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {swatches.map((c) => (
            <button key={c} type="button" onClick={() => onChange(c)} aria-label={`Use ${c}`} title={c}
              className={cn("grid h-7 w-7 place-items-center rounded-full ring-offset-2 transition", value === c ? "ring-2 ring-admin-gray-800" : "hover:scale-110")} style={{ background: c }}>
              {value === c && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkInput({ label, value, onChange, categories, optional }: { label: string; value: string; onChange: (v: string) => void; categories: PickCategory[]; optional?: boolean }) {
  const listId = useMemo(() => `links-${rid()}`, []);
  const bad = value.trim() !== "" && !isSafeHref(value);
  return (
    <label className="block">
      <Label hint={optional ? "Optional" : undefined}>{label}</Label>
      <input value={value} list={listId} onChange={(e) => onChange(e.target.value)} placeholder="/shop, /shop/category?slug=…, https://…"
        className={cn(INPUT, bad && "border-red-400 focus:border-red-500 focus:ring-red-100")} aria-invalid={bad} />
      <datalist id={listId}>
        {LINK_PRESETS.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}
        <option value="/shop?sort=discount">Deals (biggest discount)</option>
        <option value="/shop?sort=new">New arrivals</option>
        {categories.map((c) => <option key={c.slug} value={`/shop/category?slug=${encodeURIComponent(c.slug)}`}>{`Category: ${c.name}`}</option>)}
      </datalist>
      {bad && <span className="mt-1 block text-[11px] text-red-600">Use a site path (/…) or a full https:// link.</span>}
    </label>
  );
}

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/ecommerce/home-customizer/upload", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
  if (!res?.success) throw new Error(res?.message || "Upload failed.");
  return res.path as string;
}

function ImageField({ label, value, onChange, hint, aspect = "aspect-[2/1]" }: { label: string; value: string; onChange: (v: string) => void; hint?: string; aspect?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true); setErr("");
    try { onChange(await uploadImage(f)); } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    setBusy(false);
  }
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
        className={cn("group relative overflow-hidden rounded-lg border-2 border-dashed border-admin-gray-200 bg-admin-gray-50", aspect)}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc(value)} alt="" className="h-full w-full object-contain" />
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-1 text-admin-gray-400 hover:text-admin-primary">
            <Upload className="h-5 w-5" /><span className="text-xs font-medium">Click or drop an image</span>
          </button>
        )}
        {value && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition group-hover:opacity-100">
            <button type="button" onClick={() => input.current?.click()} className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-admin-gray-800">Replace</button>
            <button type="button" onClick={() => onChange("")} className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600">Remove</button>
          </div>
        )}
        {busy && <div className="absolute inset-0 grid place-items-center bg-white/70"><Loader2 className="h-5 w-5 animate-spin text-admin-primary" /></div>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <p className="mt-1 text-[11px] text-red-600">{err}</p>}
    </div>
  );
}

/** A collapsible card in the left panel. */
function Card({ icon: Icon, title, subtitle, open, onToggle, enabled, onEnabled, children, tone = "default" }: {
  icon: typeof Rows3; title: string; subtitle?: string; open: boolean; onToggle: () => void;
  enabled?: boolean; onEnabled?: (v: boolean) => void; children: React.ReactNode; tone?: "default" | "muted";
}) {
  return (
    <section className={cn("rounded-xl border bg-white shadow-sm transition", open ? "border-admin-primary/40 ring-2 ring-admin-primary/10" : "border-admin-gray-200")}>
      <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="flex cursor-pointer select-none items-center gap-3 px-4 py-3">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tone === "muted" ? "bg-admin-gray-100 text-admin-gray-500" : "bg-admin-primary-lighter text-admin-primary")}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-admin-gray-800">{title}</span>
          {subtitle && <span className="block truncate text-xs text-admin-gray-500">{subtitle}</span>}
        </span>
        {onEnabled && <Switch on={!!enabled} onChange={onEnabled} label={`Show ${title}`} />}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-admin-gray-400 transition-transform", open && "rotate-180")} />
      </div>
      {open && <div className="space-y-4 border-t border-admin-gray-100 px-4 pb-4 pt-4">{children}</div>}
    </section>
  );
}

/* ───────────────────────── block editors ───────────────────────── */

function BannerEditor({ b, set }: { b: Block<"banner">; set: (p: Partial<Block<"banner">>) => void }) {
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const slides = b.slides;
  const setSlide = (i: number, p: Partial<BannerSlide>) => set({ slides: slides.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const move = (i: number, d: -1 | 1) => { const n = [...slides]; [n[i], n[i + d]] = [n[i + d], n[i]]; set({ slides: n }); };

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setErr("");
    const list = Array.from(files).slice(0, 10 - slides.length);
    setBusy(list.length);
    const added: BannerSlide[] = [];
    for (const f of list) {
      try { added.push({ id: rid(), image: await uploadImage(f), href: "/shop" }); } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
      setBusy((n) => n - 1);
    }
    if (added.length) set({ slides: [...slides, ...added] });
  }

  return (
    <>
      <div className="space-y-2">
        <Label hint={`${slides.length}/10 · best size 1200×600`}>Slides</Label>
        {slides.length === 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">No slides yet — the banner stays hidden until you add one.</p>}
        {slides.map((s, i) => (
          <div key={s.id} className="flex gap-2 rounded-lg border border-admin-gray-200 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgSrc(s.image)} alt="" className="aspect-[2/1] w-24 shrink-0 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <input value={s.href} onChange={(e) => setSlide(i, { href: e.target.value })} placeholder="Link (optional)"
                className={cn(INPUT, "py-1.5 text-xs", s.href && !isSafeHref(s.href) && "border-red-400")} />
              <div className="mt-1.5 flex items-center gap-1">
                <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></IconBtn>
                <IconBtn label="Move down" disabled={i === slides.length - 1} onClick={() => move(i, 1)}><ArrowDown /></IconBtn>
                <IconBtn label="Remove slide" danger onClick={() => set({ slides: slides.filter((_, j) => j !== i) })}><Trash2 /></IconBtn>
              </div>
            </div>
          </div>
        ))}
        {slides.length < 10 && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy > 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-admin-gray-200 py-3 text-sm font-semibold text-admin-primary hover:border-admin-primary hover:bg-admin-primary-lighter disabled:opacity-60">
            {busy > 0 ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {busy}…</> : <><Upload className="h-4 w-4" /> Add slides</>}
          </button>
        )}
        <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        {err && <p className="text-[11px] text-red-600">{err}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <Label>Auto-slide</Label>
          <select value={b.autoplay} onChange={(e) => set({ autoplay: Number(e.target.value) })} className={INPUT}>
            <option value={0}>Off</option>{[3, 4, 5, 7, 10].map((n) => <option key={n} value={n}>Every {n}s</option>)}
          </select>
        </label>
        <div className="flex items-end"><Toggle on={b.rounded} onChange={(v) => set({ rounded: v })}>Rounded corners</Toggle></div>
      </div>
    </>
  );
}

function CategoriesEditor({ b, set, categories }: { b: Block<"categories">; set: (p: Partial<Block<"categories">>) => void; categories: PickCategory[] }) {
  const chosen = b.slugs.map((s) => categories.find((c) => c.slug === s)).filter((c): c is PickCategory => !!c);
  const rest = categories.filter((c) => !b.slugs.includes(c.slug));
  const move = (i: number, d: -1 | 1) => { const n = [...b.slugs]; [n[i], n[i + d]] = [n[i + d], n[i]]; set({ slugs: n }); };
  return (
    <>
      <Segmented value={b.source} onChange={(v) => set({ source: v })} options={[{ v: "all", label: "All categories" }, { v: "pick", label: "Choose categories" }]} />
      {b.source === "pick" && (
        <div className="space-y-2">
          {chosen.length === 0 && <p className="text-xs text-admin-gray-500">Pick the categories to show, in order.</p>}
          {chosen.map((c, i) => (
            <div key={c.slug} className="flex items-center gap-2 rounded-lg border border-admin-gray-200 px-2 py-1.5">
              <Thumb src={c.image} round />
              <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
              <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></IconBtn>
              <IconBtn label="Move down" disabled={i === chosen.length - 1} onClick={() => move(i, 1)}><ArrowDown /></IconBtn>
              <IconBtn label="Remove" danger onClick={() => set({ slugs: b.slugs.filter((s) => s !== c.slug) })}><X /></IconBtn>
            </div>
          ))}
          {rest.length > 0 && (
            <select value="" onChange={(e) => e.target.value && set({ slugs: [...b.slugs, e.target.value] })} className={INPUT}>
              <option value="">+ Add a category…</option>
              {rest.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          )}
        </div>
      )}
      <label className="block">
        <Label hint="1–30">How many to show</Label>
        <input type="number" min={1} max={30} value={b.limit} onChange={(e) => set({ limit: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} className={INPUT} />
      </label>
      <Toggle on={b.showAllButton} onChange={(v) => set({ showAllButton: v })}>&ldquo;Categories&rdquo; button (opens full list)</Toggle>
    </>
  );
}

function ProductsEditor({ b, set, categories, products }: { b: Block<"products">; set: (p: Partial<Block<"products">>) => void; categories: PickCategory[]; products: PickProduct[] }) {
  const [q, setQ] = useState("");
  const chosen = b.productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is PickProduct => !!p);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return products.filter((p) => !b.productIds.includes(p.id) && (p.name.toLowerCase().includes(s) || String(p.id) === s)).slice(0, 8);
  }, [q, products, b.productIds]);
  const move = (i: number, d: -1 | 1) => { const n = [...b.productIds]; [n[i], n[i + d]] = [n[i + d], n[i]]; set({ productIds: n }); };
  return (
    <>
      <Text label="Section title" value={b.title} onChange={(v) => set({ title: v })} max={60} placeholder="Top picks for you" />
      <label className="block">
        <Label>Products to show</Label>
        <select value={b.source} onChange={(e) => set({ source: e.target.value as Block<"products">["source"] })} className={INPUT}>
          <option value="latest">Newest arrivals</option>
          <option value="deals">Deals — discounted products</option>
          <option value="top_rated">Top rated</option>
          <option value="category">From one category</option>
          <option value="manual">Hand-picked products</option>
        </select>
      </label>
      {b.source === "category" && (
        <label className="block">
          <Label>Category</Label>
          <select value={b.category} onChange={(e) => set({ category: e.target.value })} className={cn(INPUT, !b.category && "border-amber-400")}>
            <option value="">Choose a category…</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
      )}
      {b.source === "manual" ? (
        <div className="space-y-2">
          <Label hint={`${chosen.length}/30`}>Products</Label>
          {chosen.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-admin-gray-200 px-2 py-1.5">
              <Thumb src={p.image} />
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></IconBtn>
              <IconBtn label="Move down" disabled={i === chosen.length - 1} onClick={() => move(i, 1)}><ArrowDown /></IconBtn>
              <IconBtn label="Remove" danger onClick={() => set({ productIds: b.productIds.filter((x) => x !== p.id) })}><X /></IconBtn>
            </div>
          ))}
          {chosen.length < 30 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-admin-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products to add…" className={cn(INPUT, "pl-9")} />
              {results.length > 0 && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-admin-gray-200 bg-white shadow-lg">
                  {results.map((p) => (
                    <button key={p.id} type="button" onClick={() => { set({ productIds: [...b.productIds, p.id] }); setQ(""); }}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-admin-primary-lighter">
                      <Thumb src={p.image} /><span className="min-w-0 flex-1 truncate">{p.name}</span><Plus className="h-4 w-4 text-admin-primary" />
                    </button>
                  ))}
                </div>
              )}
              {q.trim() && results.length === 0 && <p className="mt-1 text-xs text-admin-gray-500">No matching products.</p>}
            </div>
          )}
        </div>
      ) : (
        <label className="block">
          <Label hint="1–30">How many products</Label>
          <input type="number" min={1} max={30} value={b.limit} onChange={(e) => set({ limit: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} className={INPUT} />
        </label>
      )}
      <p className="flex gap-1.5 text-xs text-admin-gray-500"><Info className="mt-px h-3.5 w-3.5 shrink-0" />The row hides itself when no products match.</p>
    </>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="grid rounded-lg bg-admin-gray-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={cn("rounded-md px-2 py-1.5 text-xs font-semibold transition", value === o.v ? "bg-white text-admin-primary shadow-sm" : "text-admin-gray-500 hover:text-admin-gray-800")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactElement<{ className?: string }> }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md text-admin-gray-500 transition hover:bg-admin-gray-100 disabled:opacity-30 disabled:hover:bg-transparent [&>svg]:h-3.5 [&>svg]:w-3.5",
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:text-admin-gray-800")}>
      {children}
    </button>
  );
}

function Thumb({ src, round }: { src: string | null; round?: boolean }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={imgSrc(src)} alt="" className={cn("h-8 w-8 shrink-0 object-cover", round ? "rounded-full" : "rounded")} />
    : <span className={cn("grid h-8 w-8 shrink-0 place-items-center bg-admin-gray-100 text-admin-gray-400", round ? "rounded-full" : "rounded")}><ShoppingBag className="h-3.5 w-3.5" /></span>;
}

function blockSummary(b: HomeBlock, categories: PickCategory[]): string {
  switch (b.type) {
    case "banner": return b.slides.length ? `${b.slides.length} slide${b.slides.length > 1 ? "s" : ""}${b.autoplay ? ` · auto every ${b.autoplay}s` : ""}` : "No slides yet";
    case "categories": return b.source === "all" ? `All categories · up to ${b.limit}` : `${b.slugs.length} chosen`;
    case "products": {
      const src = { latest: "Newest", deals: "Deals", top_rated: "Top rated", category: categories.find((c) => c.slug === b.category)?.name ?? "Category", manual: `${b.productIds.length} hand-picked` }[b.source];
      return src;
    }
    case "image": return b.image ? (b.href || "No link") : "No image yet";
    case "feed": return [b.showSort && "Sort", b.showCategory && "Category", b.showBrand && "Brand", b.showFilters && "Filters"].filter(Boolean).join(" · ") || "No filter bar";
  }
}

/* ───────────────────────── preview ───────────────────────── */

/**
 * Two stacked iframes: the next render loads in the hidden one and is swapped
 * in (at the same scroll position) once it's ready, so the preview never flashes.
 */
function Preview({ version, device, focus }: { version: number; device: "mobile" | "desktop"; focus: { id: string; n: number } | null }) {
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)];
  const [front, setFront] = useState(0);
  const [srcs, setSrcs] = useState<[string, string]>([`/shop?hc=draft&v=${version}`, "about:blank"]);
  const [loading, setLoading] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(900);
  const pending = useRef<number | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const back = 1 - front;
    const y = frames[front].current?.contentWindow?.scrollY ?? 0;
    pending.current = y;
    setLoading(true);
    setSrcs((s) => { const n: [string, string] = [...s]; n[back] = `/shop?hc=draft&v=${version}`; return n; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  function onLoad(i: number) {
    if (srcs[i] === "about:blank") return;
    const w = frames[i].current?.contentWindow;
    if (i !== front) {
      if (w && pending.current) w.scrollTo(0, pending.current);
      setFront(i);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!focus) return;
    const doc = frames[front].current?.contentDocument;
    const el = doc?.querySelector<HTMLElement>(`[data-hc="${focus.id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.animate([{ outline: "3px solid #7c3aed", outlineOffset: "-3px" }, { outline: "3px solid rgba(124,58,237,0)", outlineOffset: "-3px" }], { duration: 1400, easing: "ease-out" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const W = device === "mobile" ? 390 : 1280;
  const scale = device === "mobile" ? 1 : Math.min(1, (boxW - 32) / W);
  return (
    <div ref={box} className="relative flex h-full items-start justify-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_1px_1px,#d4d4dc_1px,transparent_0)] [background-size:18px_18px] bg-admin-gray-100 p-4">
      <div className={cn("relative shrink-0 overflow-hidden bg-white shadow-2xl", device === "mobile" ? "h-full max-h-[844px] rounded-[36px] border-[10px] border-[#1f1f28]" : "rounded-lg border border-admin-gray-300")}
        style={device === "mobile" ? { width: W + 20 } : { width: W * scale, height: `calc(100%)` }}>
        <div style={device === "desktop" ? { width: W, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0" } : { width: "100%", height: "100%" }} className="relative">
          {[0, 1].map((i) => (
            <iframe key={i} ref={frames[i]} src={srcs[i]} title={i === front ? "Homepage preview" : "Preview buffer"} onLoad={() => onLoad(i)}
              className={cn("absolute inset-0 h-full w-full border-0 bg-white", i === front ? "z-10" : "z-0 opacity-0")} />
          ))}
        </div>
      </div>
      {loading && (
        <span className="absolute right-6 top-6 z-20 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-admin-gray-600 shadow">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-admin-primary" /> Updating preview
        </span>
      )}
    </div>
  );
}

/* ───────────────────────── main ───────────────────────── */

type SaveState = "idle" | "saving" | "saved" | "error";

export function HomeCustomizer({ initialDraft, initialLive, categories, products }: {
  initialDraft: HomeConfig; initialLive: HomeConfig; categories: PickCategory[]; products: PickProduct[];
}) {
  const [config, setConfig] = useState(initialDraft);
  const [serverDraft, setServerDraft] = useState(JSON.stringify(initialDraft));
  const [live, setLive] = useState(JSON.stringify(initialLive));
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [open, setOpen] = useState<string | null>("promo");
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const sent = useRef(JSON.stringify(initialDraft));
  const unpublished = serverDraft !== live;

  const problem = useMemo(() => {
    const p = config.promo;
    if (p.enabled && !p.title.trim()) return "The offer bar needs a title.";
    for (const h of [p.buttonUrl, config.strip.href]) if (h && !isSafeHref(h)) return "One of the links isn't valid.";
    for (const b of config.blocks) {
      if (b.type === "banner" && b.slides.some((s) => s.href && !isSafeHref(s.href))) return "A banner slide has an invalid link.";
      if (b.type === "image" && b.href && !isSafeHref(b.href)) return "An image banner has an invalid link.";
    }
    return "";
  }, [config]);

  const post = useCallback(async (action: "draft" | "publish", cfg: HomeConfig) => {
    const res = await fetch("/api/ecommerce/home-customizer", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, config: cfg }),
    }).then((r) => r.json()).catch(() => null);
    if (!res?.success) throw new Error(res?.message || "Couldn't save — check your connection.");
    return res.config as HomeConfig;
  }, []);

  // Debounced autosave of the draft, then refresh the preview.
  useEffect(() => {
    const json = JSON.stringify(config);
    if (json === sent.current || problem) return;
    const t = setTimeout(async () => {
      sent.current = json;
      setSave("saving");
      try {
        const clean = await post("draft", config);
        setServerDraft(JSON.stringify(clean));
        setSave("saved"); setError("");
        setVersion((v) => v + 1);
      } catch (e) {
        sent.current = "";
        setSave("error"); setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    }, 650);
    return () => clearTimeout(t);
  }, [config, problem, post]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === "saving" || JSON.stringify(config) !== sent.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [config, save]);

  async function publish() {
    if (problem) return;
    setPublishing(true);
    try {
      const clean = await post("publish", config);
      const j = JSON.stringify(clean);
      sent.current = JSON.stringify(config);
      setServerDraft(j); setLive(j); setSave("saved"); setError("");
      setToast("Published — shoppers now see this homepage.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't publish."); }
    setPublishing(false);
  }

  function discard() {
    if (!confirm("Throw away all unpublished changes and go back to the live homepage?")) return;
    setConfig(JSON.parse(live) as HomeConfig);
    setToast("Changes discarded.");
  }

  const set = <K extends keyof HomeConfig>(k: K, v: HomeConfig[K]) => setConfig((c) => ({ ...c, [k]: v }));
  const setPromo = (p: Partial<HomeConfig["promo"]>) => setConfig((c) => ({ ...c, promo: { ...c.promo, ...p } }));
  const setStrip = (p: Partial<HomeConfig["strip"]>) => setConfig((c) => ({ ...c, strip: { ...c.strip, ...p } }));
  const setCard = (p: Partial<HomeConfig["card"]>) => setConfig((c) => ({ ...c, card: { ...c.card, ...p } }));
  const setBlock = (id: string, p: Partial<HomeBlock>) => setConfig((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? ({ ...b, ...p } as HomeBlock) : b)) }));
  const moveBlock = (from: number, to: number) => setConfig((c) => {
    if (to < 0 || to >= c.blocks.length || from === to) return c;
    const n = [...c.blocks]; const [x] = n.splice(from, 1); n.splice(to, 0, x);
    return { ...c, blocks: n };
  });

  function toggle(key: string) {
    const next = open === key ? null : key;
    setOpen(next);
    if (next) setFocus({ id: next, n: Date.now() });
  }

  function addBlock(type: HomeBlockType) {
    const b = newBlock(type);
    setConfig((c) => {
      const feedAt = c.blocks.findIndex((x) => x.type === "feed");
      const n = [...c.blocks];
      // New sections go above the endless feed, which should stay last.
      n.splice(feedAt >= 0 && type !== "feed" ? feedAt : n.length, 0, b);
      return { ...c, blocks: n };
    });
    setAdding(false);
    setOpen(b.id);
  }

  const hasFeed = config.blocks.some((b) => b.type === "feed");
  const status = problem
    ? <span className="inline-flex items-center gap-1.5 text-amber-600"><CircleAlert className="h-3.5 w-3.5" />{problem}</span>
    : save === "saving" ? <span className="inline-flex items-center gap-1.5 text-admin-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving draft…</span>
    : save === "error" ? <span className="inline-flex items-center gap-1.5 text-red-600"><CircleAlert className="h-3.5 w-3.5" />{error}</span>
    : unpublished ? <span className="inline-flex items-center gap-1.5 text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />Unpublished changes</span>
    : <span className="inline-flex items-center gap-1.5 text-emerald-600"><Check className="h-3.5 w-3.5" />Live — everything published</span>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[440px_minmax(0,1fr)]">
        {/* Settings */}
        <div className="space-y-3">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-admin-gray-400">Top of page</p>

          <Card icon={Megaphone} title="Offer bar" subtitle={config.promo.enabled ? config.promo.title || "No title" : "Hidden"} open={open === "promo"} onToggle={() => toggle("promo")}
            enabled={config.promo.enabled} onEnabled={(v) => setPromo({ enabled: v })}>
            <p className="-mt-1 text-xs text-admin-gray-500">The strip above the header with a close button — like Meesho&rsquo;s &ldquo;Extra 35% off on First Order&rdquo;.</p>
            <div className="grid grid-cols-[88px_1fr] gap-3">
              <ImageField label="Image" value={config.promo.image} onChange={(v) => setPromo({ image: v })} aspect="aspect-square" />
              <div className="space-y-3">
                <Text label="Title" value={config.promo.title} onChange={(v) => setPromo({ title: v })} max={80} placeholder="Extra 10% off on First Order" />
                <Text label="Description" value={config.promo.subtitle} onChange={(v) => setPromo({ subtitle: v })} max={100} placeholder="Use code FIRST10" hint="Optional" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Text label="Button text" value={config.promo.buttonLabel} onChange={(v) => setPromo({ buttonLabel: v })} max={24} placeholder="Shop Now" hint="Blank = no button" />
              <LinkInput label="Button link" value={config.promo.buttonUrl} onChange={(v) => setPromo({ buttonUrl: v })} categories={categories} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ColorInput label="Background" value={config.promo.bgColor} onChange={(v) => setPromo({ bgColor: v })} swatches={["#e7eeff", "#fdecf5", "#fff4e0", "#e8f7ee", "#f3f3f7"]} />
              <ColorInput label="Button colour" value={config.promo.buttonColor} onChange={(v) => setPromo({ buttonColor: v })} swatches={[MEESHO.jamun, "#7c3aed", "#e11d48", "#16a34a", "#353543"]} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <Label>Show on</Label>
                <select value={config.promo.showOn} onChange={(e) => setPromo({ showOn: e.target.value as "home" | "all" })} className={INPUT}>
                  <option value="home">Homepage only</option><option value="all">Every page</option>
                </select>
              </label>
              <label className="block">
                <Label>After ✕, hide for</Label>
                <select value={config.promo.dismissHours} onChange={(e) => setPromo({ dismissHours: Number(e.target.value) })} className={INPUT}>
                  {[[0, "This visit only"], [1, "1 hour"], [24, "1 day"], [72, "3 days"], [168, "1 week"], [720, "30 days"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
          </Card>

          <Card icon={MapPin} title="Info strip" subtitle={config.strip.enabled ? config.strip.text : "Hidden"} open={open === "strip"} onToggle={() => toggle("strip")}
            enabled={config.strip.enabled} onEnabled={(v) => setStrip({ enabled: v })}>
            <div>
              <Label>Icon</Label>
              <div className="flex gap-1.5">
                {STRIP_ICONS.map(({ v, icon: I }) => (
                  <button key={v} type="button" onClick={() => setStrip({ icon: v })} aria-label={v} aria-pressed={config.strip.icon === v}
                    className={cn("grid h-9 w-9 place-items-center rounded-lg border transition", config.strip.icon === v ? "border-admin-primary bg-admin-primary-lighter text-admin-primary" : "border-admin-gray-200 text-admin-gray-500 hover:bg-admin-gray-50")}>
                    <I className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <Text label="Text" value={config.strip.text} onChange={(v) => setStrip({ text: v })} max={90} placeholder="Add delivery location to check extra discount" />
            <LinkInput label="Link" value={config.strip.href} onChange={(v) => setStrip({ href: v })} categories={categories} optional />
          </Card>

          <div className="flex items-center justify-between px-1 pt-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-admin-gray-400">Page sections · drag to reorder</p>
          </div>

          {config.blocks.length === 0 && <p className="rounded-xl border border-dashed border-admin-gray-300 p-6 text-center text-sm text-admin-gray-500">No sections — add one below.</p>}
          {config.blocks.map((b, i) => (
            <div key={b.id} draggable={open !== b.id}
              onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); if (drag !== null && drag !== i) { moveBlock(drag, i); setDrag(i); } }}
              onDragEnd={() => setDrag(null)}
              className={cn("relative transition", drag === i && "opacity-50", !b.enabled && "opacity-70")}>
              <div className="absolute -left-0.5 top-[22px] z-10 cursor-grab text-admin-gray-300 active:cursor-grabbing" aria-hidden><GripVertical className="h-4 w-4" /></div>
              <Card icon={BLOCK_ICON[b.type]} title={b.type === "products" && b.title ? b.title : BLOCK_LABEL[b.type]} subtitle={b.enabled ? blockSummary(b, categories) : "Hidden"}
                open={open === b.id} onToggle={() => toggle(b.id)} enabled={b.enabled} onEnabled={(v) => setBlock(b.id, { enabled: v })} tone={b.enabled ? "default" : "muted"}>
                {b.type === "banner" && <BannerEditor b={b} set={(p) => setBlock(b.id, p)} />}
                {b.type === "categories" && <CategoriesEditor b={b} set={(p) => setBlock(b.id, p)} categories={categories} />}
                {b.type === "products" && <ProductsEditor b={b} set={(p) => setBlock(b.id, p)} categories={categories} products={products} />}
                {b.type === "image" && <>
                  <ImageField label="Image" value={b.image} onChange={(v) => setBlock(b.id, { image: v })} hint="Any width · shown full width" aspect="aspect-[3/1]" />
                  <LinkInput label="Link" value={b.href} onChange={(v) => setBlock(b.id, { href: v })} categories={categories} optional />
                </>}
                {b.type === "feed" && <>
                  <Text label="Title" value={b.title} onChange={(v) => setBlock(b.id, { title: v })} max={60} />
                  <div>
                    <Label>Filter bar buttons</Label>
                    <div className="divide-y divide-admin-gray-100 rounded-lg border border-admin-gray-200 px-2">
                      <Toggle on={b.showSort} onChange={(v) => setBlock(b.id, { showSort: v })}>Sort</Toggle>
                      <Toggle on={b.showCategory} onChange={(v) => setBlock(b.id, { showCategory: v })}>Category</Toggle>
                      <Toggle on={b.showBrand} onChange={(v) => setBlock(b.id, { showBrand: v })}>Brand</Toggle>
                      <Toggle on={b.showFilters} onChange={(v) => setBlock(b.id, { showFilters: v })}>Filters (price, rating, discount…)</Toggle>
                    </div>
                  </div>
                </>}
                <div className="flex items-center justify-between border-t border-admin-gray-100 pt-3">
                  <div className="flex gap-1">
                    <IconBtn label="Move up" disabled={i === 0} onClick={() => moveBlock(i, i - 1)}><ArrowUp /></IconBtn>
                    <IconBtn label="Move down" disabled={i === config.blocks.length - 1} onClick={() => moveBlock(i, i + 1)}><ArrowDown /></IconBtn>
                  </div>
                  <button type="button" onClick={() => { if (confirm(`Delete the "${BLOCK_LABEL[b.type]}" section?`)) setConfig((c) => ({ ...c, blocks: c.blocks.filter((x) => x.id !== b.id) })); }}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Delete section</button>
                </div>
              </Card>
            </div>
          ))}

          {adding ? (
            <div className="rounded-xl border border-admin-primary/40 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-admin-gray-800">Add a section</span>
                <IconBtn label="Close" onClick={() => setAdding(false)}><X /></IconBtn>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(BLOCK_LABEL) as HomeBlockType[]).map((t) => {
                  const I = BLOCK_ICON[t]; const off = t === "feed" && hasFeed;
                  return (
                    <button key={t} type="button" disabled={off} onClick={() => addBlock(t)}
                      className="flex items-start gap-2 rounded-lg border border-admin-gray-200 p-2.5 text-left transition hover:border-admin-primary hover:bg-admin-primary-lighter disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-admin-gray-200 disabled:hover:bg-transparent">
                      <I className="mt-0.5 h-4 w-4 shrink-0 text-admin-primary" />
                      <span><span className="block text-sm font-semibold text-admin-gray-800">{BLOCK_LABEL[t]}</span><span className="block text-[11px] leading-tight text-admin-gray-500">{off ? "Already on the page" : BLOCK_HINT[t]}</span></span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-admin-gray-300 py-3 text-sm font-semibold text-admin-primary hover:border-admin-primary hover:bg-admin-primary-lighter">
              <Plus className="h-4 w-4" />Add section
            </button>
          )}

          <p className="px-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-admin-gray-400">Look &amp; feel</p>

          <Card icon={ShoppingBag} title="Product cards" subtitle="What each product tile shows" open={open === "card"} onToggle={() => toggle("card")}>
            <div className="divide-y divide-admin-gray-100">
              <Toggle on={config.card.showWishlist} onChange={(v) => setCard({ showWishlist: v })}>Wishlist heart</Toggle>
              <Toggle on={config.card.showBadge} onChange={(v) => setCard({ showBadge: v })}>Badge (Bestseller, New…)</Toggle>
              <Toggle on={config.card.showDealTimer} onChange={(v) => setCard({ showDealTimer: v })}>Deal countdown timer</Toggle>
              <Toggle on={config.card.showDiscount} onChange={(v) => setCard({ showDiscount: v })}>MRP &amp; % off</Toggle>
              <Toggle on={config.card.showRating} onChange={(v) => setCard({ showRating: v })}>Rating &amp; reviews</Toggle>
            </div>
          </Card>

          <Card icon={Palette} title="Theme colour" subtitle={config.accent.toUpperCase()} open={open === "theme"} onToggle={() => toggle("theme")}>
            <ColorInput label="Accent (buttons, active tab, links)" value={config.accent} onChange={(v) => set("accent", v)} swatches={ACCENTS} />
          </Card>

          <Card icon={PanelBottom} title="Bottom tab bar" subtitle={config.bottomNav ? "Home · Categories · Account · Cart" : "Hidden"} open={open === "bottom"} onToggle={() => toggle("bottom")}
            enabled={config.bottomNav} onEnabled={(v) => set("bottomNav", v)}>
            <p className="text-xs text-admin-gray-500">Meesho-style tab bar fixed to the bottom of phone screens on the homepage.</p>
          </Card>

          <p className="flex items-center gap-1.5 px-1 pb-2 pt-1 text-xs text-admin-gray-400">
            {unpublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            Edits save as a draft automatically. Shoppers see them only after you Publish.
          </p>
        </div>

        {/* Preview */}
        <div className="order-first flex h-[80vh] flex-col gap-3 lg:order-none lg:sticky lg:top-[100px] lg:h-[calc(100vh-116px)]">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-admin-gray-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="min-w-0 flex-1 basis-40 text-sm font-medium">{status}</div>
          <div className="flex rounded-lg bg-admin-gray-100 p-1">
            {([["mobile", Smartphone, "Mobile"], ["desktop", Monitor, "Desktop"]] as const).map(([d, Icon, l]) => (
              <button key={d} type="button" onClick={() => setDevice(d)} aria-pressed={device === d}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold", device === d ? "bg-white text-admin-primary shadow-sm" : "text-admin-gray-500")}>
                <Icon className="h-3.5 w-3.5" />{l}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setVersion((v) => v + 1)} title="Reload preview" aria-label="Reload preview"
            className="grid h-9 w-9 place-items-center rounded-lg border border-admin-gray-200 text-admin-gray-600 hover:bg-admin-gray-50"><RefreshCw className="h-4 w-4" /></button>
          <a href="/shop?hc=draft" target="_blank" rel="noreferrer" title="Open preview in a new tab" aria-label="Open preview in a new tab" className="grid h-9 w-9 place-items-center rounded-lg border border-admin-gray-200 text-admin-gray-600 hover:bg-admin-gray-50">
            <ExternalLink className="h-4 w-4" />
          </a>
          {unpublished && (
            <button type="button" onClick={discard} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-admin-gray-200 px-3 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50">
              <RotateCcw className="h-4 w-4" />Discard
            </button>
          )}
          <button type="button" onClick={publish} disabled={publishing || !!problem || save === "saving" || (!unpublished && JSON.stringify(config) === sent.current)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-admin-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-admin-primary-dark disabled:cursor-not-allowed disabled:opacity-50">
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Publish
          </button>
        </div>
          <div className="min-h-0 flex-1"><Preview version={version} device={device} focus={focus} /></div>
        </div>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-admin-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
