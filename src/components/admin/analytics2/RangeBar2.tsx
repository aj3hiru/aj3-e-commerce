"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Analytics2Preset } from "@/lib/analytics2-range";
import type { Analytics2Data } from "@/lib/analytics2";

const PRESETS: { value: Analytics2Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7days", label: "7 Days" },
  { value: "30days", label: "30 Days" },
  { value: "this_year", label: "This Year" },
];

interface RangeBar2Props {
  preset: Analytics2Preset;
  dateFrom: string;
  dateTo: string;
  compare: boolean;
  data: Analytics2Data;
}

function exportAnalyticsCsv(data: Analytics2Data, dateFrom: string, dateTo: string) {
  const cell = (v: string | number) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines: string[] = [];
  lines.push(`Analytics export,${dateFrom} to ${dateTo}`);
  lines.push("");
  lines.push(["Metric", "Value"].join(","));
  lines.push(["Gross Sales", data.grossSales.toFixed(2)].map(cell).join(","));
  lines.push(["Net Sales", data.netSales.toFixed(2)].map(cell).join(","));
  lines.push(["Orders", data.current.totalOrders].map(cell).join(","));
  lines.push(["Avg Order Value", data.current.avgOrderValue.toFixed(2)].map(cell).join(","));
  lines.push("");
  lines.push(["Date", "Revenue", "Orders"].join(","));
  for (const d of data.dailySeries) lines.push([d.date, d.revenue.toFixed(2), d.orders].map(cell).join(","));
  lines.push("");
  lines.push(["Payment Method", "Amount", "% Share"].join(","));
  for (const s of data.payment.slices) lines.push([s.label, s.amount.toFixed(2), `${s.pct}%`].map(cell).join(","));
  lines.push("");
  lines.push(["Top Product", "Units Sold", "Revenue"].join(","));
  for (const p of data.current.topProducts) lines.push([p.name, p.unitsSold, p.revenue.toFixed(2)].map(cell).join(","));

  const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics-${dateFrom}_to_${dateTo}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setParam(router: ReturnType<typeof useRouter>, updates: Record<string, string>) {
  const sp = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(updates)) sp.set(k, v);
  router.push(`?${sp.toString()}`, { scroll: false });
}

export function RangeBar2({ preset, dateFrom, dateTo, compare, data }: RangeBar2Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("click", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-1 rounded-[0.5rem] border border-[#dee2e6] p-1">
        {PRESETS.map((p) => (
          <button key={p.value} type="button" onClick={() => setParam(router, { preset: p.value })}
            className={cn("h-9 rounded-[0.375rem] px-3.5 text-sm font-medium transition-colors",
              preset === p.value ? "bg-[#2563eb] text-white" : "text-admin-gray-700 hover:bg-admin-gray-50")}>
            {p.label}
          </button>
        ))}
      </div>

      <div ref={wrapRef} className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)}
          className={cn("flex h-10 items-center gap-2 rounded-[0.375rem] border px-3 text-sm font-medium transition-colors",
            preset === "custom" ? "border-[#2563eb] bg-blue-50/60 text-[#2563eb]" : "border-[#dee2e6] text-admin-gray-700 hover:bg-admin-gray-50")}>
          <Calendar className="h-4 w-4" /> {dateFrom} <span className="text-admin-gray-400">→</span> {dateTo}
          <ChevronDown className="h-3.5 w-3.5 text-admin-gray-400" />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-[0.5rem] border border-[#dee2e6] bg-white p-4 shadow-xl">
            <label className="mb-2 block text-xs font-medium text-admin-gray-600">From</label>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
              className="mb-3 h-10 w-full rounded-[0.375rem] border border-[#dee2e6] px-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
            <label className="mb-2 block text-xs font-medium text-admin-gray-600">To</label>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)}
              className="mb-4 h-10 w-full rounded-[0.375rem] border border-[#dee2e6] px-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
            <button type="button" onClick={() => { setOpen(false); setParam(router, { preset: "custom", from, to }); }}
              className="h-10 w-full rounded-[0.5rem] bg-[#2563eb] text-sm font-semibold text-white hover:bg-[#1d4ed8]">
              Apply Range
            </button>
          </div>
        )}
      </div>

      <button type="button" role="switch" aria-checked={compare} onClick={() => setParam(router, { compare: compare ? "0" : "1" })}
        className="flex h-10 items-center gap-2.5 rounded-[0.375rem] px-2 text-sm font-medium text-admin-gray-700">
        <span className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors", compare ? "bg-[#2563eb]" : "bg-admin-gray-300")}>
          <span className={cn("inline-block h-4.5 w-4.5 h-[18px] w-[18px] transform rounded-full bg-white transition-transform", compare ? "translate-x-[22px]" : "translate-x-[3px]")}>
            {compare && <Check className="h-[18px] w-[18px] p-0.5 text-[#2563eb]" />}
          </span>
        </span>
        Compare
      </button>

      <button type="button" onClick={() => exportAnalyticsCsv(data, dateFrom, dateTo)}
        className="ml-auto flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#dee2e6] bg-white px-3.5 text-sm font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]">
        <Download className="h-4 w-4" /> Export
      </button>
    </section>
  );
}
