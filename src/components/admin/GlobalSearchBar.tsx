"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faReceipt, faHandHoldingUsd, faUser } from "@fortawesome/free-solid-svg-icons";

interface SearchResult {
  type: "order" | "customer" | "receipt";
  id: number | string;
  title: string;
  sub: string;
  url: string;
}

interface GlobalSearchBarProps {
  /**
   * "phpMatch" (default) — the exact `global-search.php` sizing (fixed
   * 260px/42vw width, `py-[0.55rem]` height, `bg-[#f9fafb]`) used on every
   * page this was pixel-matched against — do not change this default, or
   * every one of those pages drifts from the verified original.
   *
   * "toolbar" — same box, sized and coloured to sit flush with the `h-10`
   * pill buttons (RangeFilter, Display Options) beside it in a header row,
   * and free to grow/shrink instead of a fixed px width. Used only on
   * /admin/dashboard2's own toolbar, which is new UI with no PHP page to
   * match, so this variant is free to prioritise visual consistency with
   * its neighbours instead.
   */
  variant?: "phpMatch" | "toolbar";
}

/** The icon logic from global-search.php's result template:
 *  order → fa-receipt, receipt → fa-hand-holding-usd, anything else → fa-user. */
const TYPE_ICONS = { order: faReceipt, receipt: faHandHoldingUsd, customer: faUser };

/**
 * The header search box, ported from admin/components/global-search.php.
 *
 * It is an always-visible input, not an icon that opens a popover — that is
 * how the original works. Only the RESULTS list opens and closes.
 *
 *   .gsearch-wrap    { width:260px; max-width:42vw }  hidden below 768px
 *   .gsearch-icon    { left:12px; gray-400; .85rem }
 *   .gsearch-input   { pill; bg gray-50; 1px gray-200;
 *                      padding:.55rem .75rem .55rem 2.1rem; .875rem }
 *   :focus           { border primary; bg #fff; ring 0 0 0 3px primary-lighter }
 *   .gsearch-results { top:calc(100% + 6px); radius .6rem;
 *                      shadow 0 10px 25px rgba(0,0,0,.1); max-height 340px }
 *
 * Behaviour matches too: nothing is sent under 2 characters, keystrokes are
 * debounced by 250ms, and an empty result says `No matches for "q"`.
 */
export function GlobalSearchBar({ variant = "phpMatch" }: GlobalSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searched, setSearched] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow earlier response overwriting a newer one.
  const latestRef = useRef("");

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowResults(false);
    }
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function onChange(value: string) {
    setQuery(value);
    const q = value.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      latestRef.current = q;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data: SearchResult[] = await res.json();
        if (latestRef.current !== q) return;
        setResults(Array.isArray(data) ? data : []);
        setSearched(q);
        setShowResults(true);
      } catch {
        if (latestRef.current !== q) return;
        setResults([]);
        setSearched(q);
        setShowResults(true);
      }
    }, 250);
  }

  function go(r: SearchResult) {
    setShowResults(false);
    router.push(r.url);
  }

  const isToolbar = variant === "toolbar";

  return (
    <div
      ref={wrapRef}
      className={
        isToolbar
          // Flexes with its neighbours in the dashboard2 header row instead of
          // a fixed px width, and drops the `hidden below md:` rule — this
          // toolbar already collapses/repositions itself by breakpoint, so a
          // second independent visibility rule on top of that just fights it.
          ? "relative w-full min-w-[180px] max-w-[320px] flex-1"
          : "relative hidden w-[260px] max-w-[42vw] md:block"
      }
    >
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.85rem] leading-none text-[#9ca3af]">
        <FontAwesomeIcon icon={faSearch} />
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (query.trim().length >= 2 && searched) setShowResults(true);
        }}
        placeholder="Order ID, receipt no., name, mobile…"
        autoComplete="off"
        aria-label="Search orders, receipts and customers"
        className={
          isToolbar
            // Same rounding as its RangeFilter/Display Options neighbours
            // (`rounded-[0.5rem]`, not the PHP box's full pill) — matched to
            // their h-10 (40px) height, not their own shorter input.
            ? "h-10 w-full rounded-[0.5rem] border border-[#e5e7eb] bg-white pl-[2.1rem] pr-3 text-[0.875rem] leading-[1.5] text-black outline-none transition-all duration-150 placeholder:text-[#9ca3af] focus:border-[#7c3aed] focus:shadow-[0_0_0_3px_#f5f3ff]"
            : "w-full rounded-full border border-[#e5e7eb] bg-[#f9fafb] py-[0.55rem] pl-[2.1rem] pr-3 text-[0.875rem] leading-[1.5] text-black outline-none transition-all duration-150 placeholder:text-[#6c757d] focus:border-[#7c3aed] focus:bg-white focus:shadow-[0_0_0_3px_#f5f3ff]"
        }
      />

      {showResults && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[500] max-h-[340px] overflow-y-auto rounded-[0.6rem] border border-[#e5e7eb] bg-white shadow-[0_10px_25px_rgba(0,0,0,0.1)]">
          {results.length === 0 ? (
            <div className="p-[0.9rem] text-center text-[0.85rem] text-[#9ca3af]">
              No matches for &quot;{searched}&quot;
            </div>
          ) : (
            results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                onClick={() => go(r)}
                className="flex w-full flex-col border-b border-[#f3f4f6] px-[0.9rem] py-[0.6rem] text-left last:border-b-0 hover:bg-[#f9fafb]"
              >
                <span className="flex items-center gap-[0.4rem] text-[0.875rem] font-semibold text-[#111827]">
                  <span className="text-[0.75rem] text-[#7c3aed]">
                    <FontAwesomeIcon icon={TYPE_ICONS[r.type] ?? faUser} />
                  </span>
                  {r.title}
                </span>
                <span className="mt-px text-[0.75rem] text-[#6b7280]">{r.sub}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
