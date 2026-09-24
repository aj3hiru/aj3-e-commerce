"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";

/** Shared building blocks for the Push Manager 2 tabs (same look as coupons2 / categories2). */

export const CARD = "rounded-xl border border-admin-gray-200 bg-white shadow-sm";
export const INPUT =
  "h-10 w-full rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15";
export const LABEL = "mb-1 block text-xs font-semibold text-admin-gray-600";
export const SECTION_LABEL = "mb-3 block text-xs font-bold uppercase tracking-wide text-admin-gray-500";
export const BTN_PRIMARY =
  "flex h-10 items-center justify-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60";
export const BTN_OUTLINE =
  "flex h-10 items-center justify-center gap-2 rounded-[0.375rem] border border-[#dee2e6] bg-white px-3.5 text-sm font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] disabled:opacity-60";

/** Stored paths ("uploads/x.jpg") → absolute URLs; notification images are
 *  fetched by the subscriber's device, so they must be absolute. */
export function absoluteUrl(path: string | null | undefined, origin: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

/** ₹1,299 / ₹49.50 — whole rupees without ".00". */
export function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function StatCard({ icon: Icon, tint, value, label, suffix }: {
  icon: React.ComponentType<{ className?: string }>; tint: string; value: number; label: string; suffix?: string;
}) {
  return (
    <div className={cn(CARD, "flex h-full items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5")}>
      <span className={cn("hidden h-12 w-12 shrink-0 items-center justify-center rounded-full sm:flex", tint)}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0">
        <span className="block text-xl font-bold leading-tight text-admin-gray-900 sm:text-2xl">{formatInt(value)}{suffix}</span>
        <span className="block text-sm text-admin-gray-600">{label}</span>
      </span>
    </div>
  );
}

/** Square thumbnail that falls back to an icon when there's no image or it fails to load. */
export function Thumb({ src, className, icon: Icon = Bell, rounded = "rounded-lg" }: {
  src: string; className: string; icon?: React.ComponentType<{ className?: string }>; rounded?: string;
}) {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(true), [src]);
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden bg-[#e9ecef]", rounded, className)}>
      {src && ok
        // eslint-disable-next-line @next/next/no-img-element -- uploads/external URLs, not optimisable
        ? <img src={src} alt="" onError={() => setOk(false)} className="h-full w-full object-cover" />
        : <Icon className="h-5 w-5 text-admin-gray-400" />}
    </span>
  );
}

/** Centered modal shell with backdrop, Escape to close and a scrollable body. */
export function Modal({ title, onClose, children, footer, size = "lg", headerExtra }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
  size?: "md" | "lg" | "xl"; headerExtra?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true"
        className={cn("flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-xl",
          size === "md" ? "sm:max-w-lg" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-6xl")}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-admin-gray-100 px-5 py-3.5">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold text-admin-gray-900">{title}</h2>
          {headerExtra}
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 text-admin-gray-500 hover:bg-admin-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-admin-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ icon, tone, title, text, confirmLabel, onCancel, onConfirm }: {
  icon: React.ReactNode; tone: "red" | "blue"; title: string; text: React.ReactNode; confirmLabel: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return createPortal(
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[4px]" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-[400px] rounded-2xl bg-white p-8 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className={cn("mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-full",
          tone === "red" ? "bg-[#f8d7da] text-[#dc3545]" : "bg-blue-50 text-[#2563eb]")}>{icon}</div>
        <div className="mb-2 text-xl font-semibold text-admin-gray-900">{title}</div>
        <div className="mb-6 text-[0.95rem] text-admin-gray-500">{text}</div>
        <div className="flex justify-center gap-3">
          <button type="button" onClick={onCancel} className="h-10 rounded-[0.5rem] bg-[#e9ecef] px-6 text-sm font-medium text-[#495057] hover:bg-[#dee2e6]">Cancel</button>
          <button type="button" autoFocus onClick={onConfirm}
            className={cn("h-10 rounded-[0.5rem] px-6 text-sm font-semibold text-white", tone === "red" ? "bg-[#dc3545] hover:bg-[#bb2d3b]" : "bg-[#2563eb] hover:bg-[#1d4ed8]")}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** view-logs.php's pagination: first / prev / window of 3 with ellipses / next / last. */
export function Pager({ page, pageCount, onPage, label }: { page: number; pageCount: number; onPage: (p: number) => void; label: string }) {
  if (pageCount <= 1) return null;
  const start = Math.max(1, page - 1);
  const end = Math.min(pageCount, page + 1);
  const nums: (number | "…")[] = [];
  if (start > 1) { nums.push(1); if (start > 2) nums.push("…"); }
  for (let i = start; i <= end; i++) nums.push(i);
  if (end < pageCount) { if (end < pageCount - 1) nums.push("…"); nums.push(pageCount); }

  const btn = "flex h-9 min-w-9 items-center justify-center border border-[#dee2e6] bg-white px-2.5 text-sm -ml-px first:ml-0 first:rounded-l-[0.375rem] last:rounded-r-[0.375rem]";
  const nav = cn(btn, "text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300 disabled:hover:bg-white");
  return (
    <nav className="flex justify-center" aria-label={label}>
      <button type="button" disabled={page === 1} onClick={() => onPage(1)} className={nav} aria-label="First page"><ChevronsLeft className="h-4 w-4" /></button>
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={nav} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
      {nums.map((n, i) => n === "…"
        ? <span key={`e${i}`} className={cn(btn, "text-admin-gray-400")}>…</span>
        : <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}
            className={cn(btn, n === page ? "relative z-10 border-[#2563eb] bg-[#2563eb] text-white" : "text-[#2563eb] hover:bg-admin-gray-50")}>{n}</button>)}
      <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)} className={nav} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      <button type="button" disabled={page === pageCount} onClick={() => onPage(pageCount)} className={nav} aria-label="Last page"><ChevronsRight className="h-4 w-4" /></button>
    </nav>
  );
}

export interface RowMenuItem { label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void; danger?: boolean }

/** The ⋮ menu on a row; the list is portalled so a table's scroll box can't clip it. */
export function RowMenu({ items, disabled, label = "Actions" }: { items: RowMenuItem[]; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = menu.current?.offsetHeight ?? 130;
    const w = menu.current?.offsetWidth ?? 170;
    const openUp = r.bottom + h > window.innerHeight && r.top > h;
    setPos({ top: openUp ? r.top - h - 4 : r.bottom + 4, left: Math.max(8, r.right - w) });
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !menu.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" disabled={disabled} aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[0.375rem] text-admin-gray-500 transition-colors hover:bg-admin-gray-100 hover:text-[#2563eb] disabled:opacity-50">
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && createPortal(
        <div ref={menu} role="menu" className="fixed z-50 min-w-[170px] overflow-hidden rounded-[0.5rem] border border-black/[0.08] bg-white py-1 text-sm shadow-lg"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}>
          {items.map((it, i) => (
            <div key={it.label}>
              {it.danger && i > 0 && <div className="my-1 h-px bg-admin-gray-100" />}
              <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}
                className={cn("flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors",
                  it.danger ? "text-red-600 hover:bg-[#f8d7da]" : "text-admin-gray-800 hover:bg-admin-gray-50")}>
                <it.icon className="h-4 w-4" /> {it.label}
              </button>
            </div>
          ))}
        </div>, document.body
      )}
    </>
  );
}

// "d M y • h:i a" like view-logs.php, fixed to India time so server and browser render the same text.
const WHEN_FMT = new Intl.DateTimeFormat("en-US", {
  day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
});
export function when(iso: string): string {
  const p = Object.fromEntries(WHEN_FMT.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year} • ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
}

/** Debounced value — for search boxes that hit the server. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
