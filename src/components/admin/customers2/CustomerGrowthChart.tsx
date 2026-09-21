"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GrowthSeries } from "@/lib/customers2-growth";

/**
 * "Customer Growth" — the same look as the Sales Performance graph on
 * Sales History 2 (smooth line, soft fill, dots, hover box), but counting
 * customers who joined instead of rupees. Green is the chosen dates, blue is
 * the same number of days just before, so you can see if you're growing.
 */
const GREEN = "#16a34a";
const BLUE = "#2563eb";

/** A round axis maximum that splits into 4 whole-number steps: 4, 8, 20, 40, 100… */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const step = Math.ceil(v / 4);
  const p = Math.pow(10, Math.floor(Math.log10(step)));
  for (const m of [1, 2, 5, 10]) if (m * p >= step) return m * p * 4;
  return 10 * p * 4;
}

/**
 * Smooth line through every point using monotone cubic interpolation
 * (Fritsch–Carlson), same as Sales History 2: the line never bulges past its
 * neighbours, so it can't dip below 0 or peak above a real count.
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

const dmy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

export function CustomerGrowthChart({ growth }: { growth: GrowthSeries }) {
  const [hover, setHover] = useState<number | null>(null);
  const { buckets } = growth;
  const n = buckets.length;
  const max = niceMax(Math.max(0, ...buckets.map((b) => b.previous), ...buckets.map((b) => b.current ?? 0)));
  const ticks = [max, (max * 3) / 4, max / 2, max / 4, 0];
  // Points sit at the centre of n equal columns so labels line up beneath them.
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (v / max) * 100;

  const prevPts: [number, number][] = buckets.map((b, i) => [x(i), y(b.previous)]);
  const thisPts: [number, number][] = buckets.flatMap((b, i) => (b.current === null ? [] : [[x(i), y(b.current)] as [number, number]]));
  const area = (pts: [number, number][]) =>
    pts.length < 2 ? "" : `${smoothPath(pts)} L${pts[pts.length - 1][0]},100 L${pts[0][0]},100 Z`;
  const allZero = buckets.every((b) => b.previous === 0 && !b.current);

  // Only every few labels are printed when there are many points, so they never collide.
  const every = n <= 12 ? 1 : Math.ceil(n / 8);
  const dot = n <= 16 ? "h-2.5 w-2.5 border-2" : n <= 40 ? "h-1.5 w-1.5" : "h-1 w-1";
  const up = growth.change !== null && growth.change >= 0;
  const unitText = growth.unit === "hour" ? "by hour" : growth.unit === "day" ? "by day" : growth.unit === "week" ? "by week" : "every 30 days";

  return (
    <section className="flex flex-col rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2.5 text-base font-semibold text-admin-gray-900">
            <TrendingUp className="h-5 w-5" style={{ color: GREEN }} /> Customer Growth
          </h2>
          <p className="mt-1 text-[13px] text-admin-gray-500">
            <b className="text-admin-gray-900">{growth.currentTotal}</b> joined {unitText}
            {growth.change !== null && (
              <span className={cn("ml-2 inline-flex items-center gap-0.5 font-medium", up ? "text-emerald-600" : "text-red-500")}>
                {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(growth.change)}% vs previous period
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-5 text-[13px] text-admin-gray-700">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: GREEN }} /> This Period</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: BLUE }} /> Previous Period</span>
        </div>
      </div>

      {/* Grows to the card's height, so it lines up with Key Metrics beside it. */}
      <div className="flex min-h-[180px] flex-1 gap-3">
        <div className="flex shrink-0 flex-col text-right text-[11px] leading-none text-admin-gray-500">
          <div className="flex flex-1 flex-col justify-between">
            {ticks.map((t, i) => (
              <span key={i} className={cn("-my-[5px]", i === ticks.length - 1 && "text-admin-gray-300")}>{t}</span>
            ))}
          </div>
          <div className="h-6" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1" onMouseLeave={() => setHover(null)}>
            {ticks.map((_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-dashed border-admin-gray-100" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
            ))}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label="Customers who joined, this period against the previous one">
              <defs>
                <linearGradient id="cus2-fill-green" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GREEN} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="cus2-fill-blue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BLUE} stopOpacity="0.12" />
                  <stop offset="100%" stopColor={BLUE} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area(prevPts)} fill="url(#cus2-fill-blue)" />
              <path d={area(thisPts)} fill="url(#cus2-fill-green)" />
              <path d={smoothPath(prevPts)} fill="none" stroke={BLUE} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <path d={smoothPath(thisPts)} fill="none" stroke={GREEN} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            {/* dots as HTML so they stay round when the plot stretches */}
            {buckets.map((b, i) => (
              <span key={`p${i}`} className={cn("pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-white", dot)} style={{ left: `${x(i)}%`, top: `${y(b.previous)}%`, background: BLUE }} />
            ))}
            {buckets.map((b, i) =>
              b.current === null ? null : (
                <span key={`t${i}`} className={cn("pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-white", dot)} style={{ left: `${x(i)}%`, top: `${y(b.current)}%`, background: GREEN }} />
              )
            )}
            {/* hover columns + tooltip */}
            {buckets.map((b, i) => (
              <div key={i} data-testid="growth-col" className="absolute bottom-0 top-0" style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }} onMouseEnter={() => setHover(i)}>
                {hover === i && (
                  <>
                    <div className="absolute bottom-0 left-1/2 top-0 border-l border-admin-gray-200" />
                    <div role="tooltip" className={cn("absolute top-1 z-10 w-max rounded-lg border border-admin-gray-200 bg-white px-3 py-2 text-xs shadow-md", i >= n - 2 ? "right-1/2 mr-2" : "left-1/2 ml-2")}>
                      <div className="mb-1 font-semibold text-admin-gray-900">{b.tip}</div>
                      <div className="flex items-center gap-2 text-admin-gray-600">
                        <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />
                        Joined: <b className="text-admin-gray-900">{b.current === null ? "—" : b.current}</b>
                      </div>
                      <div className="flex items-center gap-2 text-admin-gray-600">
                        <span className="h-2 w-2 rounded-full" style={{ background: BLUE }} />
                        Before: <b className="text-admin-gray-900">{b.previous}</b>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
            {allZero && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-admin-gray-400">No new customers in these two periods</div>
            )}
          </div>
          <div className="grid h-6 items-end whitespace-nowrap text-center text-[10px] text-admin-gray-500 sm:text-xs" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {buckets.map((b, i) => (
              <span key={i} className={i % every === 0 ? "" : "invisible"}>{b.label}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-admin-gray-400">
        This period {dmy(growth.currentRange.from)} – {dmy(growth.currentRange.to)} · previous {dmy(growth.previousRange.from)} – {dmy(growth.previousRange.to)}
      </p>
    </section>
  );
}
