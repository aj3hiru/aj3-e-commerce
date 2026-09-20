"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImageIcon, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CampaignState } from "@/lib/campaign-core";

/** Product image — a grey placeholder when there's none or the file is missing. */
export function Thumb({ src, name, size = 56 }: { src: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A missing file can fail before the page is interactive (onError is missed), so also check once mounted.
  useEffect(() => {
    const el = img.current;
    setBroken(!!el && el.complete && el.naturalWidth === 0);
  }, [src]);
  const box = { width: size, height: size };
  if (!src || broken) {
    return (
      <span style={box} className="flex items-center justify-center rounded-[0.375rem] bg-admin-gray-100 text-admin-gray-400" title={src ? "Image file is missing" : "No image"}>
        <ImageIcon className="h-5 w-5" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src.startsWith("http") || src.startsWith("blob:") ? src : `/${src}`} ref={img} alt="" title={name} loading="lazy" style={box} onError={() => setBroken(true)} className="rounded-[0.375rem] border border-admin-gray-200 bg-white object-contain p-1" />;
}

export const STATE_STYLE: Record<CampaignState, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-[#5cc28a]" },
  scheduled: { label: "Scheduled", cls: "bg-[#4361ee]" },
  paused: { label: "Paused", cls: "bg-[#e0a100]" },
  ended: { label: "Ended", cls: "bg-[#8a8f98]" },
};

export function StatePill({ state }: { state: CampaignState }) {
  const s = STATE_STYLE[state];
  return <span className={cn("inline-flex h-8 items-center rounded-[0.25rem] px-3 text-[14px] font-semibold text-white", s.cls)}>{s.label}</span>;
}

/** DataTables-style pager: Previous · 1 2 3 · Next */
export function Pager({ page, pageCount, onPage, label }: { page: number; pageCount: number; onPage: (p: number) => void; label: string }) {
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = "flex h-10 min-w-10 items-center justify-center border border-[#dee2e6] px-3 text-sm -ml-px first:ml-0 first:rounded-l-[0.375rem] last:rounded-r-[0.375rem]";
  return (
    <nav className="flex" aria-label={label}>
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={cn(btn, "gap-1 text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300 disabled:hover:bg-transparent")}><ChevronLeft className="h-4 w-4" /> Previous</button>
      {nums.map((n, i) => n === "…"
        ? <span key={`e${i}`} className={cn(btn, "text-admin-gray-400")}>…</span>
        : <button key={n} type="button" aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}
            className={cn(btn, n === page ? "relative z-10 border-[#2563eb] bg-[#2563eb] text-white" : "text-[#2563eb] hover:bg-admin-gray-50")}>{n}</button>)}
      <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)} className={cn(btn, "gap-1 text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300 disabled:hover:bg-transparent")}>Next <ChevronRight className="h-4 w-4" /></button>
    </nav>
  );
}

/** A centred dialog over a dimmed page. Click outside or press Escape to close. */
export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cn("my-4 flex max-h-[calc(100vh-32px)] w-full flex-col rounded-xl bg-white shadow-2xl", wide ? "max-w-[820px]" : "max-w-[440px]")}>
        <div className="flex items-center justify-between border-b border-admin-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-admin-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-admin-gray-500 hover:bg-admin-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-admin-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** "Are you sure?" for End now / Delete. */
export function ConfirmDialog({ title, body, confirmLabel, danger, busy, onConfirm, onClose }: {
  title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean; busy: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-9 rounded-[0.375rem] bg-[#6c757d] px-4 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
          <button type="button" disabled={busy} onClick={onConfirm}
            className={cn("flex h-9 items-center gap-2 rounded-[0.375rem] px-4 text-sm font-semibold text-white disabled:opacity-60", danger ? "bg-[#dc3545] hover:bg-[#bb2d3b]" : "bg-[#2563eb] hover:bg-[#1d4ed8]")}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm leading-6 text-admin-gray-700">{body}</div>
    </Modal>
  );
}
