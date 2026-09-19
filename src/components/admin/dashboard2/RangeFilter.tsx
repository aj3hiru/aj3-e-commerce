"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarAlt, faChevronDown, faCheck } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";
import type { DashboardRange } from "@/lib/dashboard-range";

const PRESETS: { value: DashboardRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "prev_month", label: "Previous Month" },
];

interface RangeFilterProps {
  currentRange: DashboardRange;
  rangeLabel: string;
  dateFrom: string;
  dateTo: string;
  /**
   * "segmented" = one track with a pill per preset (wide screens).
   * "compact"   = a single button showing the current range that opens a list.
   * Both drive the same `?range=` URL, so switching between them on resize
   * never loses the selection.
   */
  mode: "segmented" | "compact";
}

/**
 * Date-range filter for dashboard2's header.
 *
 * Presets are plain links: the range lives in the URL, so a chosen range
 * survives a refresh and can be bookmarked. Only the custom from/to picker
 * holds client state.
 */
export function RangeFilter({ currentRange, rangeLabel, dateFrom, dateTo, mode }: RangeFilterProps) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "custom" | "list">(null);
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function applyCustom(e: React.FormEvent) {
    e.preventDefault();
    setOpen(null);
    router.push(`?range=custom&from=${from}&to=${to}`);
  }

  const customForm = (
    <form
      onSubmit={applyCustom}
      onClick={(e) => e.stopPropagation()}
      className="p-3"
    >
      <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.05em] text-[#9ca3af]">Custom range</p>
      <label className="mb-2 block">
        <span className="mb-1 block text-[0.75rem] text-[#6b7280]">From</span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-full rounded-[0.5rem] border border-[#e5e7eb] px-2.5 py-1.5 text-[0.875rem] focus:border-[#7c3aed] focus:outline-none"
        />
      </label>
      <label className="mb-3 block">
        <span className="mb-1 block text-[0.75rem] text-[#6b7280]">To</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-full rounded-[0.5rem] border border-[#e5e7eb] px-2.5 py-1.5 text-[0.875rem] focus:border-[#7c3aed] focus:outline-none"
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-[0.5rem] bg-[#7c3aed] py-2 text-[0.875rem] font-semibold text-white hover:bg-[#6d28d9]"
      >
        Apply
      </button>
    </form>
  );

  const popover = "absolute top-full z-[200] mt-2 w-[260px] rounded-[0.6rem] border border-[#e5e7eb] bg-white shadow-[0_10px_25px_rgba(0,0,0,0.1)]";

  if (mode === "compact") {
    return (
      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => (o ? null : "list"));
          }}
          aria-haspopup="menu"
          aria-expanded={!!open}
          className="flex h-10 items-center gap-2 rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]"
        >
          <span className="text-[#7c3aed]"><FontAwesomeIcon icon={faCalendarAlt} /></span>
          <span className="max-w-[160px] truncate">{rangeLabel}</span>
          <span className={cn("text-[0.7rem] text-[#9ca3af] transition-transform", open && "rotate-180")}>
            <FontAwesomeIcon icon={faChevronDown} />
          </span>
        </button>

        {open && (
          <div className={cn(popover, "right-0")}>
            {open === "list" ? (
              <div className="p-[0.35rem]" role="menu">
                {PRESETS.map((p) => (
                  <a
                    key={p.value}
                    href={`?range=${p.value}`}
                    role="menuitem"
                    className={cn(
                      "flex items-center justify-between rounded-[0.4rem] px-[0.65rem] py-[0.55rem] text-[0.875rem]",
                      currentRange === p.value ? "bg-[#f5f3ff] font-semibold text-[#7c3aed]" : "text-[#1f2937] hover:bg-[#f9fafb]"
                    )}
                  >
                    {p.label}
                    {currentRange === p.value && <FontAwesomeIcon icon={faCheck} className="text-[0.75rem]" />}
                  </a>
                ))}
                <hr className="mx-[0.35rem] my-1 border-0 border-t border-[#f3f4f6]" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen("custom");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[0.4rem] px-[0.65rem] py-[0.55rem] text-left text-[0.875rem]",
                    currentRange === "custom" ? "bg-[#f5f3ff] font-semibold text-[#7c3aed]" : "text-[#1f2937] hover:bg-[#f9fafb]"
                  )}
                >
                  <FontAwesomeIcon icon={faCalendarAlt} className="text-[0.8rem]" /> Custom range…
                </button>
              </div>
            ) : (
              customForm
            )}
          </div>
        )}
      </div>
    );
  }

  // Segmented
  return (
    <div className="flex items-center rounded-[0.6rem] border border-[#e5e7eb] bg-white p-1" ref={wrapRef}>
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => (o ? null : "custom"));
          }}
          aria-label="Pick a custom date range"
          aria-expanded={open === "custom"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[0.4rem] text-[0.9rem] transition-colors",
            currentRange === "custom" ? "bg-[#7c3aed] text-white" : "text-[#9ca3af] hover:bg-[#f9fafb] hover:text-[#4b5563]"
          )}
        >
          <FontAwesomeIcon icon={faCalendarAlt} />
        </button>
        {open === "custom" && <div className={cn(popover, "left-0")}>{customForm}</div>}
      </div>

      {PRESETS.map((p) => (
        <a
          key={p.value}
          href={`?range=${p.value}`}
          aria-current={currentRange === p.value ? "true" : undefined}
          className={cn(
            "whitespace-nowrap rounded-[0.4rem] px-3 py-1.5 text-[0.875rem] transition-colors",
            currentRange === p.value
              ? "bg-[#7c3aed] font-semibold text-white"
              : "font-medium text-[#4b5563] hover:bg-[#f9fafb] hover:text-[#111827]"
          )}
        >
          {p.label}
        </a>
      ))}
    </div>
  );
}
