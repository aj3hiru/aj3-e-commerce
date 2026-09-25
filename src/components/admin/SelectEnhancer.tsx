"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search } from "lucide-react";

/**
 * Every <select> on an admin page opens the admin's own white list (the one
 * the Orders status pills use) instead of the browser / OS pop-up — so the
 * panel looks the same in Chrome, Safari, Windows and a Tauri desktop app.
 *
 * It works on the real <select>: picking an item sets its value and fires the
 * normal "change" event, so every existing onChange keeps working unchanged.
 * Phones and tablets keep their native picker (better for touch). A select
 * can opt out with data-native.
 */

interface Opt { value: string; label: string; disabled: boolean; group: string | null }
interface Open { el: HTMLSelectElement; opts: Opt[]; top: number; left: number; width: number; up: boolean; maxH: number }

const SEARCH_FROM = 10; // lists this long get a search box

function readOptions(el: HTMLSelectElement): Opt[] {
  const out: Opt[] = [];
  for (const o of Array.from(el.options)) {
    if (o.hidden) continue;
    const g = o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : null;
    out.push({ value: o.value, label: o.label || o.text, disabled: o.disabled || (o.parentElement instanceof HTMLOptGroupElement && o.parentElement.disabled), group: g });
  }
  return out;
}

function choose(el: HTMLSelectElement, value: string) {
  if (el.value === value) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const eligible = (t: EventTarget | null): HTMLSelectElement | null => {
  const el = t instanceof Element ? t.closest("select") : null;
  if (!(el instanceof HTMLSelectElement) || el.multiple || el.size > 1 || el.disabled || el.hasAttribute("data-native")) return null;
  return el;
};

export function SelectEnhancer() {
  const [open, setOpen] = useState<Open | null>(null);
  const [hi, setHi] = useState(0);
  const [q, setQ] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const fine = useRef(true);

  const show = useCallback((el: HTMLSelectElement) => {
    const r = el.getBoundingClientRect();
    const opts = readOptions(el);
    const below = window.innerHeight - r.bottom - 8, above = r.top - 8;
    const want = Math.min(320, opts.length * 34 + (opts.length >= SEARCH_FROM ? 48 : 0) + 16);
    const up = below < Math.min(want, 220) && above > below;
    const width = Math.max(r.width, 160);
    setOpen({ el, opts, width, up, top: up ? r.top - 4 : r.bottom + 4, left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8), maxH: Math.max(140, Math.min(320, up ? above : below)) });
    setQ("");
    setHi(Math.max(0, opts.findIndex((o) => o.value === el.value)));
    el.focus({ preventScroll: true });
  }, []);

  // Open on click / keyboard instead of the native pop-up (mouse & trackpad only).
  useEffect(() => {
    fine.current = window.matchMedia("(pointer: fine)").matches;
    const onDown = (e: MouseEvent) => {
      if (!fine.current || e.button !== 0) return;
      const el = eligible(e.target);
      if (!el) return;
      e.preventDefault();
      if (open?.el === el) { setOpen(null); return; }
      show(el);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!fine.current || open) return;
      const el = eligible(e.target);
      if (!el) return;
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp" || (e.altKey && e.key === "ArrowDown")) {
        e.preventDefault();
        show(el);
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown, true); document.removeEventListener("keydown", onKey, true); };
  }, [open, show]);

  // Close on outside click, scroll elsewhere, resize.
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && e.target !== open.el) setOpen(null); };
    const scroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOpen(null); };
    const resize = () => setOpen(null);
    document.addEventListener("mousedown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => { document.removeEventListener("mousedown", outside); window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", resize); };
  }, [open]);

  const list = useMemo(() => (open ? open.opts.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase())) : []), [open, q]);

  // Keep the highlighted item in view.
  useLayoutEffect(() => {
    menu.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  // Keys while the list is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(null); open.el.focus(); return; }
      if (e.key === "Tab") { setOpen(null); return; }
      const step = (d: number) => {
        e.preventDefault();
        setHi((h) => { let n = h; for (let i = 0; i < list.length; i++) { n = (n + d + list.length) % list.length; if (!list[n].disabled) break; } return n; });
      };
      if (e.key === "ArrowDown") return step(1);
      if (e.key === "ArrowUp") return step(-1);
      if (e.key === "Enter") {
        e.preventDefault();
        const o = list[hi];
        if (o && !o.disabled) { choose(open.el, o.value); setOpen(null); open.el.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, list, hi]);

  if (!open) return null;
  const current = open.el.value;
  const searchable = open.opts.length >= SEARCH_FROM;
  let lastGroup: string | null = null;

  return createPortal(
    <div ref={menu} role="listbox" aria-label="Options"
      className="fixed z-[3000] overflow-hidden border border-black/[0.175] bg-white py-1 text-[14px] text-[#212529] shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
      style={{ left: open.left, width: open.width, ...(open.up ? { bottom: window.innerHeight - open.top } : { top: open.top }), borderRadius: 6 }}>
      {searchable && (
        <div className="relative mx-2 mb-1 mt-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} placeholder="Search…" aria-label="Search options"
            className="h-8 w-full rounded-[6px] border border-[#e5e7eb] pl-8 pr-2 text-[13px] outline-none focus:border-[#86b7fe]" />
        </div>
      )}
      <div className="overflow-y-auto" style={{ maxHeight: open.maxH - (searchable ? 44 : 0) }}>
        {list.length === 0 && <p className="px-4 py-2 text-[13px] text-[#9ca3af]">No match</p>}
        {list.map((o, i) => {
          const header = o.group !== lastGroup && o.group ? o.group : null;
          lastGroup = o.group;
          const selected = o.value === current;
          return (
            <div key={`${o.group ?? ""}:${o.value}:${i}`}>
              {header && <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{header}</p>}
              <button type="button" data-i={i} role="option" aria-selected={selected} disabled={o.disabled}
                onMouseEnter={() => setHi(i)}
                onClick={() => { choose(open.el, o.value); setOpen(null); open.el.focus(); }}
                className={`flex w-full items-center gap-2 px-4 py-[0.4rem] text-left disabled:cursor-not-allowed disabled:text-[#adb5bd] ${i === hi ? "bg-[#e9ecef]" : ""} ${o.group ? "pl-6" : ""}`}>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[#2563eb]" strokeWidth={3} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
