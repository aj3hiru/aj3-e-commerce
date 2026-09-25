"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CategorySheet } from "./CategorySheet";

export interface CircleCategory { slug: string; name: string; image: string | null }

export const OPEN_CATEGORIES_EVENT = "shop:open-categories";

function Circle({ c, size }: { c: CircleCategory; size: "sm" | "lg" }) {
  const [ok, setOk] = useState(true);
  const cls = size === "sm" ? "h-[52px] w-[52px]" : "h-[72px] w-[72px]";
  return c.image && ok
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={`/${c.image}`} alt="" loading="lazy" onError={() => setOk(false)} className={`${cls} mx-auto block rounded-full bg-[#f3f3f7] object-cover`} />
    : <span className={`${cls} mx-auto grid place-items-center rounded-full bg-[#f3f0ff] text-lg font-bold text-[var(--hp-accent)]`}>{c.name.charAt(0).toUpperCase()}</span>;
}

/**
 * Meesho's round category shortcuts: a horizontal row under the banner. The
 * first circle ("Categories") opens every category in a sheet — the bottom
 * navigation's Categories tab opens the same sheet.
 */
/** Meesho's pink four-square "Categories" icon. */
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <rect x="2" y="2" width="9" height="9" rx="2.2" fill="#f79bc2" /><rect x="13" y="2" width="9" height="9" rx="2.2" fill="#f06ea9" />
      <rect x="2" y="13" width="9" height="9" rx="2.2" fill="#f06ea9" /><rect x="13" y="13" width="9" height="9" rx="2.2" fill="#f79bc2" />
    </svg>
  );
}

export function CategoryCircles({ strip, all, showAllButton = true }: { strip: CircleCategory[]; all: CircleCategory[]; showAllButton?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_CATEGORIES_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CATEGORIES_EVENT, onOpen);
  }, []);
  if (all.length === 0) return null;
  const shown = strip.length ? strip : all.slice(0, 10);
  return (
    <>
      <nav aria-label="Shop by category" id="categories"
        className="flex gap-1 overflow-x-auto px-2 pb-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-3">
        {showAllButton && (
          <button type="button" onClick={() => setOpen(true)} className="w-[73px] shrink-0 text-center">
            <span className="mx-auto grid h-[52px] w-[52px] place-items-center rounded-full bg-[#feeff6]"><GridIcon /></span>
            <span className="mt-1.5 block truncate text-[13px] leading-4 text-[#353543]">Categories</span>
          </button>
        )}
        {shown.map((c) => (
          <Link key={c.slug} href={`/category?slug=${encodeURIComponent(c.slug)}`} className="w-[73px] shrink-0 text-center">
            <Circle c={c} size="sm" />
            <span className="mt-1.5 block truncate px-0.5 text-[13px] leading-4 text-[#353543]">{c.name}</span>
          </Link>
        ))}
      </nav>
      {open && <CategorySheet all={all} featured={(strip.length ? strip : all).slice(0, 4)} onClose={close} />}
    </>
  );
}
