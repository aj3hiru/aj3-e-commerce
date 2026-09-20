"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DisplayOptionsPanel } from "./DisplayOptionsPanel";
import { cn } from "@/lib/utils";
import type { DashboardRange } from "@/lib/dashboard-range";

interface DateRangeBarProps {
  currentRange: DashboardRange;
  rangeLabel: string;
  dateFrom: string;
  dateTo: string;
  /** Show the dashboard's Display Options button. Only the dashboard wraps
   *  this bar in <DashboardWidgetPrefsProvider>; on any other page (Sales
   *  History, Analytics) the button has nothing to control and, without the
   *  provider, crashed the whole page — so it is opt-in. */
  showDisplayOptions?: boolean;
}

const PRESETS: { value: DashboardRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "prev_month", label: "Previous Month" },
];

/**
 * The `.range-bar` above the dashboard, ported from admin/dashboard.php:
 *
 *   .range-bar        { flex; gap:.5rem; wrap; #fff; 1px solid var(--gray-200);
 *                       radius .5rem; padding:.75rem 1rem; margin-bottom:1rem }
 *   .range-bar-label  { .8125rem; var(--gray-500); margin-right:auto }
 *   .range-bar .btn-group .btn { font-size:.8125rem }
 *   .range-bar-custom { flex; gap:.4rem; margin-left:auto }
 *
 * Button colours are Bootstrap 5.3 defaults, NOT the admin purple: the
 * e-commerce admin pages include only ecom-head.php, which overrides
 * `.action-list .btn-primary` but never `.btn-primary` itself. So the selected
 * preset really is Bootstrap blue #0d6efd here, and Apply really is the grey
 * #6c757d `.btn-secondary`. Recolouring them to var(--primary) would look
 * tidier but would no longer match the original admin.
 *
 *   .btn-sm                 { padding:.25rem .5rem; radius .25rem }
 *   .btn-primary            { #0d6efd bg/border, #fff }
 *   .btn-outline-secondary  { #6c757d text+border, transparent; hover #6c757d/#fff }
 *   .btn-group .btn         { square inner corners, rounded outer only, -1px overlap }
 */
export function DateRangeBar({ currentRange, rangeLabel, dateFrom, dateTo, showDisplayOptions = false }: DateRangeBarProps) {
  const router = useRouter();
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);

  function applyCustom(e: React.FormEvent) {
    e.preventDefault();
    // Matches the PHP's reversed-range guard: ?range=custom always resolves
    // server-side, which also swaps from/to if they arrive backwards.
    router.push(`?range=custom&from=${from}&to=${to}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[0.5rem] border border-admin-gray-200 bg-white px-4 py-3">
      <span className="mr-auto text-[0.8125rem] text-admin-gray-500">
        Showing: <strong className="font-bold">{rangeLabel}</strong>
      </span>

      {/* .btn-group */}
      <div className="inline-flex">
        {PRESETS.map((p, i) => {
          const active = currentRange === p.value;
          return (
            <a
              key={p.value}
              href={`?range=${p.value}`}
              className={cn(
                "relative border px-2 py-1 text-[0.8125rem] leading-normal transition-colors",
                // .btn-group: only the outer corners are rounded, and inner
                // borders collapse via a -1px pull.
                i === 0 && "rounded-l-[0.25rem]",
                i === PRESETS.length - 1 && "rounded-r-[0.25rem]",
                i > 0 && "-ml-px",
                active
                  ? "z-10 border-[#0d6efd] bg-[#0d6efd] text-white"
                  : "border-[#6c757d] bg-transparent text-[#6c757d] hover:bg-[#6c757d] hover:text-white"
              )}
            >
              {p.label}
            </a>
          );
        })}
      </div>

      {/* .range-bar-custom */}
      <form onSubmit={applyCustom} className="ml-auto flex items-center gap-[0.4rem]">
        <input
          type="date"
          name="from"
          aria-label="Range start date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          // .form-control.form-control-sm + the inline width:150px from the PHP
          className="w-[150px] rounded-[0.25rem] border border-admin-gray-300 px-2 py-1 text-[0.875rem] text-admin-gray-700 focus:border-admin-primary focus:outline-none"
        />
        <span className="text-[0.875em] text-[#6c757d]">to</span>
        <input
          type="date"
          name="to"
          aria-label="Range end date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-[150px] rounded-[0.25rem] border border-admin-gray-300 px-2 py-1 text-[0.875rem] text-admin-gray-700 focus:border-admin-primary focus:outline-none"
        />
        <button
          type="submit"
          // .btn.btn-secondary.btn-sm
          className="rounded-[0.25rem] border border-[#6c757d] bg-[#6c757d] px-2 py-1 text-[0.875rem] text-white hover:border-[#5c636a] hover:bg-[#5c636a]"
        >
          Apply
        </button>
      </form>

      {showDisplayOptions && <DisplayOptionsPanel />}
    </div>
  );
}
