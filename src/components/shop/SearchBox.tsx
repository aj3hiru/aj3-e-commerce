"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpLeft, Clock, LayoutGrid, Loader2, Search, Tag, X } from "lucide-react";
import type { SuggestResult } from "@/lib/shop-suggest";
import { formatMoneyInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const RECENT_KEY = "shop_recent_searches";
const img = (src: string | null) => (!src ? null : /^(https?:|\/|data:|blob:)/.test(src) ? src : `/${src}`);

function readRecent(): string[] {
  try { return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]).filter((s) => typeof s === "string").slice(0, 6); } catch { return []; }
}
function saveRecent(q: string) {
  const t = q.trim();
  if (!t) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([t, ...readRecent().filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 6))); } catch { /* storage blocked */ }
}

/** The typed words in bold, like Flipkart / Meesho suggestions. */
function Highlight({ text, q }: { text: string; q: string }) {
  const words = q.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "ig"));
  return <>{parts.map((p, i) => (i % 2 ? <b key={i} className="font-semibold text-[#111]">{p}</b> : <span key={i}>{p}</span>))}</>;
}

type Item = { key: string; href: string; label: string };

/**
 * Header search with live results: matching categories, brands and products
 * (photo, price, discount) as you type, recent searches when empty, arrow keys
 * + Enter to pick, Esc to close. Enter with nothing picked searches as before.
 */
export function SearchBox({ variant, placeholder, initial }: { variant: "desktop" | "mobile"; placeholder: string; initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SuggestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [hi, setHi] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const term = q.trim();

  useEffect(() => setQ(initial), [initial]);

  // Fetch suggestions a moment after typing stops; older requests are cancelled.
  useEffect(() => {
    if (!open || term.length < 1) { setData(null); setLoading(false); return; }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/shop/suggest?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => r.json()).then((d: SuggestResult) => { setData(d); setHi(-1); })
        .catch(() => {}).finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    }, 160);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [term, open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("touchstart", away); };
  }, [open]);

  const items: Item[] = useMemo(() => {
    if (!term) return recent.map((r) => ({ key: `r:${r}`, href: `/?q=${encodeURIComponent(r)}`, label: r }));
    if (!data) return [];
    return [
      ...data.categories.map((c) => ({ key: `c:${c.slug}`, href: `/category?slug=${encodeURIComponent(c.slug)}`, label: c.name })),
      ...data.brands.map((b) => ({ key: `b:${b.id}`, href: `/?brand=${b.id}`, label: b.name })),
      ...data.products.map((p) => ({ key: `p:${p.id}`, href: `/product/${p.slug}`, label: p.name })),
      ...(data.total > 0 ? [{ key: "all", href: `/?q=${encodeURIComponent(term)}`, label: term }] : []),
    ];
  }, [term, data, recent]);

  function go(href: string, remember: string) {
    saveRecent(remember);
    setOpen(false);
    input.current?.blur();
    router.push(href);
  }
  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const pick = hi >= 0 ? items[hi] : null;
    if (pick) return go(pick.href, pick.key.startsWith("p:") || pick.key.startsWith("c:") || pick.key.startsWith("b:") ? term : pick.label);
    if (term) go(`/?q=${encodeURIComponent(term)}`, term);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (!items.length || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    setOpen(true);
    setHi((h) => (e.key === "ArrowDown" ? (h + 1) % items.length : (h <= 0 ? items.length : h) - 1));
  }

  const idx = (key: string) => items.findIndex((i) => i.key === key);
  const row = (key: string) => cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-[#353543]", idx(key) === hi ? "bg-[#f4f4f8]" : "hover:bg-[#f8f8fb]");
  const showPanel = open && (term ? !!data || loading : recent.length > 0);
  const desktop = variant === "desktop";

  const field = desktop ? (
    <div className="flex h-11 w-full">
      <input ref={input} type="text" name="q" value={q} autoComplete="off" role="combobox" aria-expanded={showPanel} aria-controls="shop-suggest" aria-autocomplete="list"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setRecent(readRecent()); setOpen(true); }} onKeyDown={onKey}
        placeholder={placeholder}
        className={cn("w-full flex-1 border border-r-0 border-[#cfcedc] px-4 text-sm text-[#353543] outline-none placeholder:text-[#8b8ba3] focus:border-[var(--hp-accent)]", showPanel ? "rounded-tl-[8px]" : "rounded-l-[8px]")} />
      <button type="submit" className={cn("bg-[var(--hp-accent)] px-[26px] text-[13px] font-bold tracking-[0.4px] text-white hover:brightness-95", showPanel ? "rounded-tr-[8px]" : "rounded-r-[8px]")}>SEARCH</button>
    </div>
  ) : (
    <div className="flex items-center gap-2.5 rounded-[8px] border border-[#cfcedc] bg-white px-3.5 py-3 focus-within:border-[var(--hp-accent)]">
      <Search className="h-[20px] w-[20px] shrink-0 text-[#5d7eea]" strokeWidth={2} />
      <input ref={input} type="search" name="q" value={q} autoComplete="off" enterKeyHint="search" role="combobox" aria-expanded={showPanel} aria-controls="shop-suggest" aria-autocomplete="list"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setRecent(readRecent()); setOpen(true); }} onKeyDown={onKey}
        placeholder={placeholder}
        className="flex-1 border-none bg-transparent text-[14px] text-[#353543] outline-none placeholder:text-[#8b8ba3] [&::-webkit-search-cancel-button]:hidden" />
      {q && <button type="button" aria-label="Clear search" onClick={() => { setQ(""); input.current?.focus(); }} className="grid h-6 w-6 place-items-center rounded-full bg-[#eeeef3] text-[#6b6b80]"><X className="h-3.5 w-3.5" /></button>}
    </div>
  );

  return (
    <div ref={box} className={cn("relative", desktop && "min-w-[200px] flex-1")}>
      <form action="/" method="GET" onSubmit={submit} role="search">{field}</form>
      {showPanel && (
        <div id="shop-suggest" role="listbox"
          className={cn("absolute left-0 right-0 z-[960] max-h-[min(70vh,560px)] overflow-y-auto border border-[#e4e4ec] bg-white py-1.5 font-storefront shadow-[0_12px_28px_rgba(0,0,0,0.12)]",
            desktop ? "top-full rounded-b-[8px] border-t-0" : "top-[calc(100%+6px)] rounded-[10px]")}>
          {!term && (
            <>
              <div className="flex items-center justify-between px-4 pb-1 pt-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#8b8ba3]">
                Recent searches
                <button type="button" onClick={() => { try { localStorage.removeItem(RECENT_KEY); } catch {} setRecent([]); }} className="text-[12px] font-medium normal-case tracking-normal text-[var(--hp-accent)]">Clear</button>
              </div>
              {recent.map((r) => (
                <button key={r} type="button" role="option" aria-selected={idx(`r:${r}`) === hi} onClick={() => go(`/?q=${encodeURIComponent(r)}`, r)} className={row(`r:${r}`)}>
                  <Clock className="h-4 w-4 shrink-0 text-[#9a9ab0]" /><span className="min-w-0 flex-1 truncate">{r}</span>
                  <ArrowUpLeft className="h-4 w-4 shrink-0 text-[#b5b5c6]" onClick={(e) => { e.stopPropagation(); setQ(r); input.current?.focus(); }} />
                </button>
              ))}
            </>
          )}

          {term && !data && loading && <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-[#8b8ba3]"><Loader2 className="h-4 w-4 animate-spin" />Searching…</p>}

          {term && data && (
            <>
              {data.categories.map((c) => (
                <button key={c.slug} type="button" role="option" aria-selected={idx(`c:${c.slug}`) === hi} onClick={() => go(`/category?slug=${encodeURIComponent(c.slug)}`, term)} className={row(`c:${c.slug}`)}>
                  {img(c.image)
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={img(c.image)!} alt="" className="h-9 w-9 shrink-0 rounded-full bg-[#f3f3f7] object-cover" />
                    : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#feeff6] text-[var(--hp-accent)]"><LayoutGrid className="h-4 w-4" /></span>}
                  <span className="min-w-0 flex-1"><span className="block truncate"><Highlight text={c.name} q={term} /></span><span className="text-[12px] text-[#8b8ba3]">in Categories · {c.count} product{c.count === 1 ? "" : "s"}</span></span>
                </button>
              ))}
              {data.brands.map((b) => (
                <button key={b.id} type="button" role="option" aria-selected={idx(`b:${b.id}`) === hi} onClick={() => go(`/?brand=${b.id}`, term)} className={row(`b:${b.id}`)}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef2ff] text-[#5d7eea]"><Tag className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate"><Highlight text={b.name} q={term} /></span><span className="text-[12px] text-[#8b8ba3]">Brand · {b.count} product{b.count === 1 ? "" : "s"}</span></span>
                </button>
              ))}
              {(data.categories.length > 0 || data.brands.length > 0) && data.products.length > 0 && <div className="mx-4 my-1 border-t border-[#f0f0f5]" />}
              {data.products.map((p) => (
                <button key={p.id} type="button" role="option" aria-selected={idx(`p:${p.id}`) === hi} onClick={() => go(`/product/${p.slug}`, term)} className={row(`p:${p.id}`)}>
                  {img(p.image)
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={img(p.image)!} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-[6px] bg-[#f3f3f7] object-cover" />
                    : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[6px] bg-[#f3f3f7] text-[#b5b5c6]"><Search className="h-4 w-4" /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[#555]"><Highlight text={p.name} q={term} /></span>
                    <span className="mt-0.5 flex items-baseline gap-1.5 text-[13px]">
                      <b className="font-bold text-[#353543]">{formatMoneyInt(p.finalPrice)}</b>
                      {p.discountPct > 0 && <><s className="text-[12px] text-[#8b8ba3]">{formatMoneyInt(p.price)}</s><span className="text-[12px] font-semibold text-[#038d63]">{p.discountPct}% off</span></>}
                      {p.stock === "out" && <span className="text-[12px] font-medium text-[#e0413a]">Out of stock</span>}
                    </span>
                  </span>
                </button>
              ))}
              {data.total > 0 ? (
                <button type="button" role="option" aria-selected={idx("all") === hi} onClick={() => go(`/?q=${encodeURIComponent(term)}`, term)}
                  className={cn(row("all"), "mt-1 border-t border-[#f0f0f5] font-semibold text-[var(--hp-accent)]")}>
                  <Search className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">See all {data.total} result{data.total === 1 ? "" : "s"} for “{term}”</span>
                </button>
              ) : !data.categories.length && !data.brands.length && (
                <p className="px-4 py-4 text-center text-[13px] text-[#8b8ba3]">No products found for “{term}”. Try another word.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
