"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartBar } from "@fortawesome/free-solid-svg-icons";
import { formatMoney } from "@/lib/format";

interface SalesChartProps {
  series: { label: string; value: number }[];
  empty: boolean;
}

const LINE = "#7c3aed"; // admin --primary; one series, so no legend — the card title names it.

/**
 * Axis labels only: short Indian-style money — ₹500, ₹20k, ₹1.5L, ₹2Cr. The
 * tooltip shows the exact figure, so rounding here loses nothing.
 *
 * Hand-rolled on purpose: Intl's en-IN "compact" notation abbreviates
 * thousands as "T" (₹20T), which any reader takes for trillions.
 */
function compactMoney(v: number): string {
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (v >= 1e7) return `₹${trim(v / 1e7)}Cr`;
  if (v >= 1e5) return `₹${trim(v / 1e5)}L`;
  if (v >= 1e3) return `₹${trim(v / 1e3)}k`;
  return `₹${Math.round(v)}`;
}

function niceMax(v: number): number {
  if (v <= 0) return 4;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

/**
 * Smooth the line through the same data points a straight-segment polyline
 * would hit — a Catmull-Rom-to-Bézier conversion, not an arbitrary spline.
 * That distinction matters on a money chart: an approximating smoother
 * (e.g. resampling to fewer points) can draw the curve above or below a
 * real value between two points, which reads as sales data that was never
 * reported. Catmull-Rom passes through every input point exactly and only
 * curves the segments between them, so the shape gets softer without any
 * point silently moving.
 *
 * `points` is [x, y] pairs in the same 0–100 viewBox space `x()`/`y()`
 * already produce. Endpoints are clamped (tangent = the one adjacent
 * segment) rather than wrapped, since this is an open line, not a loop.
 */
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  if (points.length === 2) return `M${points[0][0]},${points[0][1]} L${points[1][0]},${points[1][1]}`;

  const d: string[] = [`M${points[0][0]},${points[0][1]}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    // Catmull-Rom → cubic Bézier control points (standard 1/6 tangent scale).
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d.push(`C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`);
  }
  return d.join(" ");
}

/**
 * This week's paid sales, Monday → Sunday.
 *
 * Built as an SVG plot stretched to the card (preserveAspectRatio="none", with
 * non-scaling strokes so the line stays 2px) and HTML for everything that must
 * not stretch — axis labels, the hover dot and the tooltip. Points sit at the
 * centre of seven equal columns, so the day labels line up under them exactly.
 */
export function SalesChart({ series, empty }: SalesChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const n = series.length;
  const max = niceMax(Math.max(0, ...series.map((p) => p.value)));
  const ticks = [max, (max * 3) / 4, max / 2, max / 4, 0];

  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (v / max) * 100;

  const points: [number, number][] = series.map((p, i) => [x(i), y(p.value)]);
  const linePath = smoothPath(points);
  // Same curve as the line, closed down to the baseline for the fill — built
  // by dropping the line path's own leading "M<start>" and prefixing a walk
  // from the baseline up to that same start point instead, so the curve
  // itself is never recomputed or approximated a second time.
  const curveAfterStart = linePath.replace(/^M[^ ]+/, "");
  const areaPath = n > 0
    ? `M${x(0)},100 L${points[0][0]},${points[0][1]}${curveAfterStart} L${x(n - 1)},100 Z`
    : "";

  return (
    <div className="flex h-[240px] flex-col">
      <div className="flex min-h-0 flex-1">
        {/* y-axis labels */}
        <div className="flex w-12 shrink-0 flex-col justify-between pb-0 pr-2 text-right text-[0.6875rem] text-[#9ca3af]" aria-hidden>
          {(empty ? ["", "", "", "", ""] : ticks.map(compactMoney)).map((t, i) => (
            <span key={i} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
              {t}
            </span>
          ))}
        </div>

        {/* plot */}
        <div
          className="relative min-w-0 flex-1 border-b border-l border-[#e5e7eb] outline-none focus-visible:ring-2 focus-visible:ring-[#c4b5fd]"
          tabIndex={empty ? -1 : 0}
          role={empty ? undefined : "img"}
          aria-label={empty ? undefined : "Sales this week. Use the left and right arrow keys to read each day."}
          onKeyDown={(e) => {
            if (empty) return;
            if (e.key === "ArrowRight") setHover((h) => (h === null ? 0 : Math.min(n - 1, h + 1)));
            if (e.key === "ArrowLeft") setHover((h) => (h === null ? n - 1 : Math.max(0, h - 1)));
            if (e.key === "Escape") setHover(null);
          }}
          onBlur={() => setHover(null)}
        >
          {/* recessive grid */}
          {!empty &&
            [25, 50, 75].map((g) => (
              <div key={g} className="absolute left-0 right-0 border-t border-dashed border-[#f3f4f6]" style={{ top: `${g}%` }} />
            ))}

          {!empty && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <defs>
                <linearGradient id="d2-sales-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={LINE} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#d2-sales-fill)" />
              <path
                d={linePath}
                fill="none"
                stroke={LINE}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}

          {/* hover layer: crosshair, dot and tooltip in HTML so they don't stretch */}
          {!empty && hover !== null && (
            <>
              <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-[#d1d5db]" style={{ left: `${x(hover)}%` }} />
              <div
                className="pointer-events-none absolute h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#7c3aed]"
                style={{ left: `${x(hover)}%`, top: `${y(series[hover].value)}%`, background: LINE }}
              />
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-2.5 py-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
                style={{
                  left: `clamp(48px, ${x(hover)}%, calc(100% - 48px))`,
                  top: `calc(${y(series[hover].value)}% - 52px)`,
                }}
              >
                <div className="text-[0.6875rem] text-[#6b7280]">{series[hover].label}</div>
                <div className="text-[0.8125rem] font-bold text-[#111827]">{formatMoney(series[hover].value)}</div>
              </div>
            </>
          )}

          {/* hit targets — one full-height column per day, wider than the mark */}
          {!empty && (
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
              {series.map((p, i) => (
                <div key={p.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              ))}
            </div>
          )}

          {/* empty state, as in the design */}
          {empty && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
              <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#f3f4f6] text-[1.1rem] text-[#9ca3af]">
                <FontAwesomeIcon icon={faChartBar} />
              </span>
              <p className="text-[0.875rem] font-semibold text-[#111827]">No sales data available</p>
              <p className="mt-0.5 text-[0.75rem] text-[#6b7280]">Sales chart will be shown once orders are received</p>
            </div>
          )}
        </div>
      </div>

      {/* x-axis labels, centred under each column */}
      <div className="ml-12 grid pt-2 text-center text-[0.75rem] text-[#9ca3af]" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {series.map((p, i) => (
          <span key={p.label} className={hover === i ? "font-semibold text-[#374151]" : undefined}>
            {p.label}
          </span>
        ))}
      </div>

      {/* table view for screen readers */}
      <table className="sr-only">
        <caption>Paid sales this week</caption>
        <thead>
          <tr><th>Day</th><th>Sales</th></tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.label}><td>{p.label}</td><td>{formatMoney(p.value)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
