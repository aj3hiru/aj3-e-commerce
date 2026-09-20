"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChartPoint } from "@/lib/campaigns2";
import { money, moneyShort } from "./format";

const GREEN = "#16a34a";

/** A round axis maximum: the next 1/1.5/2/2.5/3/4/5/6/8 × 10ⁿ above the data. */
function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * Smooth line through every point using monotone cubic interpolation
 * (Fritsch–Carlson): between two points the line stays between their two
 * values, so it can't dip below ₹0 or peak above a real total — on a money
 * chart that would show sales that never happened. (Same as Sales History.)
 */
function smoothPath(points: [number, number][]) {
  const n = points.length;
  if (n < 2) return "";
  if (n === 2) return `M${points[0][0]},${points[0][1]} L${points[1][0]},${points[1][1]}`;
  const dx = (i: number) => points[i + 1][0] - points[i][0];
  const slope = points.slice(0, -1).map((p, i) => (points[i + 1][1] - p[1]) / dx(i));
  const m = points.map((_, i) =>
    i === 0 ? slope[0] : i === n - 1 ? slope[n - 2] : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  );
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  const d = [`M${points[0][0]},${points[0][1]}`];
  for (let i = 0; i < n - 1; i++) {
    const h = dx(i) / 3;
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    d.push(`C${x0 + h},${y0 + m[i] * h} ${x1 - h},${y1 - m[i + 1] * h} ${x1},${y1}`);
  }
  return d.join(" ");
}

export function CampaignSalesChart({ points, granularity }: { points: ChartPoint[]; granularity: "day" | "week" }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const max = niceMax(Math.max(0, ...points.map((p) => p.revenue)));
  const ticks = [max, (max * 3) / 4, max / 2, max / 4, 0];
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (v / max) * 100;
  const pts: [number, number][] = points.map((p, i) => [x(i), y(p.revenue)]);
  const line = smoothPath(pts);
  const area = pts.length < 2 ? "" : `${line} L${pts[pts.length - 1][0]},100 L${pts[0][0]},100 Z`;
  const empty = points.every((p) => p.revenue === 0 && p.units === 0);
  // Show about ten x-axis labels however long the range is.
  const every = Math.max(1, Math.ceil(n / 10));
  const showDots = n <= 45;

  return (
    <section className="flex flex-col rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-semibold text-admin-gray-900">
          <TrendingUp className="h-5 w-5" style={{ color: GREEN }} /> Campaign Sales
        </h2>
        <span className="flex items-center gap-2 text-[13px] text-admin-gray-700">
          <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} /> Sales made at a campaign price, {granularity === "day" ? "per day" : "per week"}
        </span>
      </div>

      <div className="flex min-h-[200px] flex-1 gap-3">
        {/* y-axis labels (the spacer matches the x-label row below the plot) */}
        <div className="flex shrink-0 flex-col text-right text-[11px] leading-none text-admin-gray-500">
          <div className="flex flex-1 flex-col justify-between">
            {ticks.map((t, i) => (
              <span key={i} className={cn("-my-[5px]", i === ticks.length - 1 && "text-admin-gray-300")}>{moneyShort(t)}</span>
            ))}
          </div>
          <div className="h-6" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1" onMouseLeave={() => setHover(null)}>
            {ticks.map((_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-dashed border-admin-gray-100" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
            ))}
            {!empty && (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                <defs>
                  <linearGradient id="co2-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GREEN} stopOpacity="0.16" />
                    <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={area} fill="url(#co2-fill)" />
                <path d={line} fill="none" stroke={GREEN} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            {/* a single point can't make a line, so it is drawn as a dot */}
            {!empty && showDots && points.map((p, i) => (
              <span key={p.key} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${x(i)}%`, top: `${y(p.revenue)}%`, background: GREEN }} />
            ))}
            {points.map((p, i) => (
              <div key={p.key} className="absolute bottom-0 top-0" style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }} onMouseEnter={() => setHover(i)}>
                {hover === i && (
                  <>
                    <div className="absolute bottom-0 left-1/2 top-0 border-l border-admin-gray-200" />
                    <div className={cn("absolute top-1 z-10 w-max rounded-lg border border-admin-gray-200 bg-white px-3 py-2 text-xs shadow-md", i >= n / 2 ? "right-1/2 mr-2" : "left-1/2 ml-2")}>
                      <div className="mb-1 font-semibold text-admin-gray-900">{granularity === "week" ? `Week of ${p.label}` : p.label}</div>
                      <div className="text-admin-gray-600">Sales: <b className="text-admin-gray-900">{money(p.revenue)}</b></div>
                      <div className="text-admin-gray-600">Units: <b className="text-admin-gray-900">{p.units}</b> · Orders: <b className="text-admin-gray-900">{p.orders}</b></div>
                      <div className="text-admin-gray-600">Discount given: <b className="text-admin-gray-900">{money(p.discount)}</b></div>
                    </div>
                  </>
                )}
              </div>
            ))}
            {empty && (
              <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-admin-gray-400">No sales at a campaign price in this period yet</div>
            )}
          </div>
          <div className="grid h-6 items-end text-center text-[10px] text-admin-gray-500 sm:text-xs" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {points.map((p, i) => (
              <span key={p.key} className="overflow-visible whitespace-nowrap">{i % every === 0 ? p.label : ""}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
