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
}

const PRESETS: { value: DashboardRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "prev_month", label: "Previous Month" },
];

/** Verified against the .range-bar markup in dashboard.php. */
export function DateRangeBar({ currentRange, rangeLabel, dateFrom, dateTo }: DateRangeBarProps) {
  const router = useRouter();
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);

  function applyCustom(e: React.FormEvent) {
    e.preventDefault();
    router.push(`?range=custom&from=${from}&to=${to}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap bg-white border border-admin-gray-200 rounded-lg px-4 py-3 mb-4">
      <span className="text-sm text-admin-gray-500 mr-auto">
        Showing: <strong className="text-admin-gray-900">{rangeLabel}</strong>
      </span>

      <div className="flex rounded-md overflow-hidden border border-admin-gray-300">
        {PRESETS.map((p) => (
          <a
            key={p.value}
            href={`?range=${p.value}`}
            className={cn(
              "px-3 py-1.5 text-[0.8125rem] border-r border-admin-gray-300 last:border-r-0",
              currentRange === p.value
                ? "bg-admin-primary text-white"
                : "bg-white text-admin-gray-700 hover:bg-admin-gray-50"
            )}
          >
            {p.label}
          </a>
        ))}
      </div>

      <form onSubmit={applyCustom} className="flex items-center gap-1.5 ml-auto">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-[150px] text-sm border border-admin-gray-300 rounded px-2 py-1.5"
        />
        <span className="text-admin-gray-400 text-sm">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-[150px] text-sm border border-admin-gray-300 rounded px-2 py-1.5"
        />
        <button type="submit" className="bg-admin-gray-600 hover:bg-admin-gray-700 text-white text-sm rounded px-3 py-1.5">
          Apply
        </button>
      </form>

      <DisplayOptionsPanel />
    </div>
  );
}
