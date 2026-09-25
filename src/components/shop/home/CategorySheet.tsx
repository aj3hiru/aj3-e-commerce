"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Star, X } from "lucide-react";
import type { FeedProduct } from "@/lib/shop-feed-shared";
import { formatMoneyInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CircleCategory } from "./CategoryCircles";

const src = (s: string | null) => (!s ? null : /^(https?:|\/|data:|blob:)/.test(s) ? s : `/${s}`);
const catHref = (slug: string) => `/category?slug=${encodeURIComponent(slug)}`;
const picks = new Map<string, FeedProduct[]>(); // loaded once per visit

function Pic({ image, name, className }: { image: string | null; name: string; className: string }) {
  const [ok, setOk] = useState(true);
  const s = src(image);
  return s && ok
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={s} alt="" loading="lazy" onError={() => setOk(false)} className={cn("object-cover", className)} />
    : <span className={cn("grid place-items-center bg-[#f3f0ff] text-lg font-bold text-[var(--hp-accent)]", className)}>{name.charAt(0).toUpperCase()}</span>;
}

/** The small heading row: "POPULAR ————". */
function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.08em] text-[#8b8ba3]">
      <span className="shrink-0">{children}</span><span className="h-px flex-1 bg-[#dcdce6]" />
    </p>
  );
}

function Tile({ href, image, name, round, onPick, sub }: { href: string; image: string | null; name: string; round?: boolean; onPick: () => void; sub?: React.ReactNode }) {
  return (
    <Link href={href} onClick={onPick} className="group min-w-0 text-center">
      <Pic image={image} name={name} className={cn("mx-auto block aspect-square w-full max-w-[92px] bg-[#f5f5f8] transition group-active:scale-95", round ? "rounded-full" : "rounded-[10px]")} />
      <span className="mt-1.5 line-clamp-2 block text-[12.5px] font-medium leading-[1.25] text-[#4a4a5a]">{name}</span>
      {sub}
    </Link>
  );
}

/**
 * Meesho's "Categories" screen: a rail of categories on the left, and on the
 * right either Popular (featured + every category) or the chosen category's
 * products. Full screen on phones, a large panel on computers.
 */
export function CategorySheet({ all, featured, accent, onClose }: { all: CircleCategory[]; featured: CircleCategory[]; accent?: string; onClose: () => void }) {
  const [active, setActive] = useState<string>("popular");
  const [items, setItems] = useState<FeedProduct[] | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  const current = all.find((c) => c.slug === active);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => {
    pane.current?.scrollTo({ top: 0 });
    if (active === "popular") return;
    const hit = picks.get(active);
    if (hit) { setItems(hit); return; }
    setItems(null);
    const ctl = new AbortController();
    fetch(`/api/shop/suggest?cat=${encodeURIComponent(active)}`, { signal: ctl.signal })
      .then((r) => r.json()).then((d: { products: FeedProduct[] }) => { picks.set(active, d.products); setItems(d.products); })
      .catch(() => { if (!ctl.signal.aborted) setItems([]); });
    return () => ctl.abort();
  }, [active]);

  const railBtn = (key: string, label: string, icon: React.ReactNode) => (
    <button key={key} type="button" onClick={() => setActive(key)} aria-current={active === key}
      className={cn("relative flex w-full flex-col items-center gap-1.5 border-b border-[#e9e9f0] px-1.5 py-3.5 text-center",
        active === key ? "bg-white text-[var(--hp-accent)]" : "text-[#4a4a5a]")}>
      {active === key && <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-[var(--hp-accent)]" />}
      {icon}
      <span className={cn("line-clamp-2 text-[12.5px] leading-[1.25]", active === key ? "font-semibold" : "font-medium")}>{label}</span>
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex justify-center bg-black/40 font-storefront sm:items-center sm:p-6" onClick={onClose}
      style={accent ? ({ "--hp-accent": accent } as React.CSSProperties) : undefined}>
      <div role="dialog" aria-modal="true" aria-label="Categories" onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(82vh,720px)] sm:max-w-[780px] sm:rounded-[14px]">
        <div className="flex items-center gap-4 border-b border-[#ececf2] px-4 py-3.5">
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-[#4a4a5a] hover:bg-[#f3f3f7]"><X className="h-6 w-6" /></button>
          <h3 className="text-[19px] font-bold text-[var(--hp-accent)]">Categories</h3>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav aria-label="Category list" className="w-[92px] shrink-0 overflow-y-auto bg-[#f5f5fa] [scrollbar-width:none] sm:w-[128px] [&::-webkit-scrollbar]:hidden">
            {railBtn("popular", "Popular", <span className="grid h-11 w-11 place-items-center rounded-full bg-[#fde8f3]"><Star className="h-5 w-5 text-[#f5b301]" fill="#f5b301" /></span>)}
            {all.map((c) => railBtn(c.slug, c.name, <Pic image={c.image} name={c.name} className="h-11 w-11 rounded-full bg-[#ebebf2]" />))}
          </nav>

          <div ref={pane} className="min-w-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 sm:px-6">
            {active === "popular" ? (
              <>
                <Kicker>Popular</Kicker>
                {featured.length > 0 && (
                  <>
                    <h4 className="mb-3 mt-2 text-[17px] font-bold text-[#353543]">Featured</h4>
                    <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4">
                      {featured.map((c) => <Tile key={c.slug} href={catHref(c.slug)} image={c.image} name={c.name} round onPick={onClose} />)}
                    </div>
                  </>
                )}
                <h4 className="mb-3 mt-6 text-[17px] font-bold text-[#353543]">All Categories</h4>
                <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4">
                  {all.map((c) => <Tile key={c.slug} href={catHref(c.slug)} image={c.image} name={c.name} onPick={onClose} />)}
                </div>
              </>
            ) : current && (
              <>
                <Kicker>{current.name}</Kicker>
                <div className="mb-3 mt-2 flex items-center justify-between gap-3">
                  <h4 className="min-w-0 truncate text-[17px] font-bold text-[#353543]">Shop {current.name}</h4>
                  <Link href={catHref(current.slug)} onClick={onClose} className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-[var(--hp-accent)]">View all<ChevronRight className="h-4 w-4" /></Link>
                </div>
                {items === null ? (
                  <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4">
                    {Array.from({ length: 9 }, (_, i) => <div key={i}><div className="mx-auto aspect-square w-full max-w-[92px] animate-pulse rounded-[10px] bg-[#f0f0f5]" /><div className="mx-auto mt-2 h-3 w-3/4 animate-pulse rounded bg-[#f0f0f5]" /></div>)}
                  </div>
                ) : items.length === 0 ? (
                  <p className="py-10 text-center text-[13px] text-[#8b8ba3]">No products in {current.name} yet.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4">
                    {items.map((p) => (
                      <Tile key={p.id} href={`/product/${p.slug}`} image={p.image} name={p.name} onPick={onClose}
                        sub={<span className="mt-0.5 block text-[12.5px] font-bold text-[#353543]">{formatMoneyInt(p.finalPrice)}{p.discountPct > 0 && <span className="ml-1 font-semibold text-[#038d63]">{p.discountPct}% off</span>}</span>} />
                    ))}
                    <Link href={catHref(current.slug)} onClick={onClose} className="text-center">
                      <span className="mx-auto grid aspect-square w-full max-w-[92px] place-items-center rounded-[10px] border border-dashed border-[color-mix(in_srgb,var(--hp-accent)_45%,white)] bg-[color-mix(in_srgb,var(--hp-accent)_6%,white)] text-[var(--hp-accent)]"><ChevronRight className="h-6 w-6" /></span>
                      <span className="mt-1.5 block text-[12.5px] font-semibold text-[var(--hp-accent)]">View all</span>
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
