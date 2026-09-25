"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { NavParent } from "@/lib/admin-nav-config";
import { cn } from "@/lib/utils";

/** Keys for what a person has hidden from their sidebar (saved in this browser). */
export const sectionKey = (section: string) => `s:${section}`;
export const linkKey = (section: string, label: string) => `l:${section}|${label}`;
export const subKey = (section: string, parent: string, label: string) => `u:${section}|${parent}|${label}`;

const STORE = "admin_sidebar_hidden_v1";

export function useSidebarHidden() {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch { /* storage blocked — show everything */ }
  }, []);
  const update = (next: Set<string>) => {
    setHidden(next);
    try { window.localStorage.setItem(STORE, JSON.stringify([...next])); } catch { /* ignore */ }
  };
  return [hidden, update] as const;
}

export interface MenuSection { title: string; links: NavParent[] }

function Check({ checked, onChange, label, strong }: { checked: boolean; onChange: (v: boolean) => void; label: string; strong?: boolean }) {
  return (
    <label className={cn("flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-1.5 text-[13px]", strong ? "font-semibold text-[#111827]" : "text-[#4b5563]")}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 shrink-0 accent-[#7c3aed]" />
      <span className="truncate">{label}</span>
    </label>
  );
}

/** Small icon in the sidebar header: pick which sections, menus and sub-menus the sidebar shows. */
export function SidebarMenuOptions({ sections, hidden, onChange }: { sections: MenuSection[]; hidden: Set<string>; onChange: (next: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 8, window.innerWidth - 288)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", esc); };
  }, [open]);

  const set = (keys: string[], show: boolean) => {
    const next = new Set(hidden);
    for (const k of keys) { if (show) next.delete(k); else next.add(k); }
    onChange(next);
  };

  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Sidebar display options" title="Show / hide menus"
        className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-[#6b7280] transition hover:bg-[#f3f4f6] hover:text-[#111827]", open && "bg-[#f5f3ff] text-[#7c3aed]")}>
        <SlidersHorizontal className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div ref={panel} role="dialog" aria-label="Sidebar menus"
          className="admin-ui fixed z-[3000] flex max-h-[min(70vh,560px)] w-[280px] flex-col rounded-[10px] border border-[#e5e7eb] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
          style={{ top: pos.top, left: pos.left }}>
          <div className="flex items-center justify-between border-b border-[#f3f4f6] px-4 py-3">
            <span className="text-[13px] font-bold text-[#111827]">Sidebar menus</span>
            <button type="button" onClick={() => onChange(new Set())} disabled={hidden.size === 0}
              className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[12px] font-medium text-[#7c3aed] hover:bg-[#f5f3ff] disabled:text-[#9ca3af] disabled:hover:bg-transparent">
              <RotateCcw className="h-3.5 w-3.5" />Show all
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-2">
            {sections.map((sec) => {
              const sk = sectionKey(sec.title);
              const secOn = !hidden.has(sk);
              return (
                <div key={sec.title} className="border-b border-[#f3f4f6] py-1.5 last:border-0">
                  <Check strong label={sec.title.charAt(0) + sec.title.slice(1).toLowerCase()} checked={secOn} onChange={(v) => set([sk], v)} />
                  {secOn && (
                    <div className="ml-6">
                      {sec.links.map((l) => {
                        const lk = linkKey(sec.title, l.label);
                        const subs = l.submenu ?? [];
                        const exp = expanded[lk];
                        return (
                          <div key={lk}>
                            <div className="flex items-center">
                              <Check label={l.label} checked={!hidden.has(lk)} onChange={(v) => set([lk], v)} />
                              {subs.length > 0 && !hidden.has(lk) && (
                                <button type="button" onClick={() => setExpanded((e) => ({ ...e, [lk]: !e[lk] }))} aria-label={`${exp ? "Hide" : "Show"} ${l.label} sub-menus`}
                                  className="grid h-6 w-6 place-items-center rounded-[6px] text-[#9ca3af] hover:bg-[#f3f4f6]">
                                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", exp && "rotate-180")} />
                                </button>
                              )}
                            </div>
                            {exp && !hidden.has(lk) && (
                              <div className="ml-6">
                                {subs.map((s) => {
                                  const uk = subKey(sec.title, l.label, s.label);
                                  return <Check key={uk} label={s.label} checked={!hidden.has(uk)} onChange={(v) => set([uk], v)} />;
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
