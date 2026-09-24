"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, X } from "lucide-react";

export interface CircleCategory { slug: string; name: string; image: string | null }

export const OPEN_CATEGORIES_EVENT = "shop:open-categories";

function Circle({ c, size }: { c: CircleCategory; size: "sm" | "lg" }) {
  const [ok, setOk] = useState(true);
  const cls = size === "sm" ? "h-14 w-14" : "h-[72px] w-[72px]";
  return c.image && ok
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={`/${c.image}`} alt="" loading="lazy" onError={() => setOk(false)} className={`${cls} mx-auto block rounded-full bg-[#f3f3f7] object-cover`} />
    : <span className={`${cls} mx-auto grid place-items-center rounded-full bg-storefront-green-light text-lg font-bold text-storefront-green`}>{c.name.charAt(0).toUpperCase()}</span>;
}

/**
 * Meesho's round category shortcuts: a horizontal row under the banner. The
 * first circle ("Categories") opens every category in a sheet — the bottom
 * navigation's Categories tab opens the same sheet.
 */
export function CategoryCircles({ strip, all }: { strip: CircleCategory[]; all: CircleCategory[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_CATEGORIES_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CATEGORIES_EVENT, onOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  if (all.length === 0) return null;
  const shown = strip.length ? strip : all.slice(0, 10);
  return (
    <>
      <nav aria-label="Shop by category" id="categories"
        className="flex gap-3 overflow-x-auto px-4 pb-3 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-5">
        <button type="button" onClick={() => setOpen(true)} className="w-[68px] shrink-0 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#eef1ff] text-[#5a4fcf]"><LayoutGrid className="h-6 w-6" /></span>
          <span className="mt-1.5 block truncate text-[13px] text-[#333]">Categories</span>
        </button>
        {shown.map((c) => (
          <Link key={c.slug} href={`/shop/category?slug=${encodeURIComponent(c.slug)}`} className="w-[68px] shrink-0 text-center">
            <Circle c={c} size="sm" />
            <span className="mt-1.5 block truncate text-[13px] text-[#333]">{c.name}</span>
          </Link>
        ))}
      </nav>
      {open && createPortal(
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="All categories" onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-[18px] bg-white font-storefront shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-[#e7e5ec] px-5 py-3.5">
              <h3 className="text-[17px] font-bold text-[#333]">All Categories</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-[#f1eff5]"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-4 overflow-y-auto p-5 sm:grid-cols-4">
              {all.map((c) => (
                <Link key={c.slug} href={`/shop/category?slug=${encodeURIComponent(c.slug)}`} onClick={() => setOpen(false)} className="text-center">
                  <Circle c={c} size="lg" />
                  <span className="mt-2 line-clamp-2 block text-[12.5px] leading-tight text-[#333]">{c.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
