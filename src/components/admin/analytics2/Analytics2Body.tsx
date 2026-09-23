"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  IndianRupee, Wallet, ShoppingCart, Receipt, TrendingUp, TrendingDown, ArrowUpRight, ChevronRight,
  ImageIcon, Users, UserPlus, UserCheck, ChartBar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { formatMoney, formatInt } from "@/lib/format";
import type { Delta } from "@/lib/dashboard2-delta";
import type { Analytics2Data } from "@/lib/analytics2";

const CARD = "rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm";

/* ───────────────────────── stat cards ───────────────────────── */

function DeltaPill({ delta, goodWhenUp = true }: { delta: Delta; goodWhenUp?: boolean }) {
  const good = delta.direction === "flat" || (delta.direction === "up") === goodWhenUp;
  const text = delta.pct === null ? "New" : `${delta.pct > 0 ? "+" : ""}${delta.pct}%`;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[0.35rem] px-1.5 py-0.5 text-xs font-semibold",
      good ? "bg-[#ecfdf5] text-[#047857]" : "bg-[#fef2f2] text-[#b91c1c]")}>
      {delta.direction === "up" ? <TrendingUp className="h-3 w-3" /> : delta.direction === "down" ? <TrendingDown className="h-3 w-3" /> : null}
      {text}
    </span>
  );
}

function StatCard2({ icon: Icon, tint, label, value, delta, sparkline, compare }: {
  icon: React.ComponentType<{ className?: string }>; tint: string; label: string; value: string; delta: Delta; sparkline: number[]; compare: boolean;
}) {
  const max = Math.max(1, ...sparkline);
  const min = Math.min(0, ...sparkline);
  const pts = sparkline.map((v, i) => {
    const x = sparkline.length > 1 ? (i / (sparkline.length - 1)) * 100 : 0;
    const y = max === min ? 50 : 100 - ((v - min) / (max - min)) * 100;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", tint)}><Icon className="h-5 w-5" /></span>
        {sparkline.length > 1 && (
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-8 w-20 shrink-0 opacity-80">
            <polyline points={pts.split(" ").map((p) => { const [x, y] = p.split(","); return `${x},${(Number(y) / 100) * 40}`; }).join(" ")}
              fill="none" stroke="currentColor" strokeWidth={2} className="text-current" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
      <div className="mt-3 text-2xl font-bold leading-tight text-admin-gray-900">{value}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-sm text-admin-gray-600">{label}</span>
        {compare && <DeltaPill delta={delta} />}
      </div>
    </div>
  );
}

/* ───────────────────────── dual-line chart (sales-history2 quality) ───────────────────────── */

const moneyShort = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** A round axis maximum: the next 1/1.5/2/2.5/3/4/5/6/8 × 10ⁿ above the data. */
function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * Smooth line through every point using monotone cubic interpolation
 * (Fritsch–Carlson) — same technique as sales-history2's Sales Performance
 * chart. Unlike a plain Catmull-Rom spline, it never bulges past its
 * neighbouring points, so a revenue/order line can't dip below 0 or peak
 * above a real total between two days.
 */
function smoothPath(points: [number, number][]): string {
  const n = points.length;
  if (n < 2) return "";
  if (n === 2) return `M${points[0][0]},${points[0][1]} L${points[1][0]},${points[1][1]}`;
  const dx = (i: number) => points[i + 1][0] - points[i][0];
  const slope = points.slice(0, -1).map((p, i) => (points[i + 1][1] - p[1]) / dx(i));
  const m = points.map((_, i) =>
    i === 0 ? slope[0] : i === n - 1 ? slope[n - 2] : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  );
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / slope[i], b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * slope[i]; m[i + 1] = t * b * slope[i]; }
  }
  const d = [`M${points[0][0]},${points[0][1]}`];
  for (let i = 0; i < n - 1; i++) {
    const h = dx(i) / 3;
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    d.push(`C${x0 + h},${y0 + m[i] * h} ${x1 - h},${y1 - m[i + 1] * h} ${x1},${y1}`);
  }
  return d.join(" ");
}

const REV_COLOR = "#7c3aed";
const ORD_COLOR = "#2563eb";

function RevenueOrdersChart({ series }: { series: { date: string; revenue: number; orders: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [grain, setGrain] = useState<"daily" | "weekly">("daily");

  const points = useMemo(() => {
    if (grain === "daily") return series;
    const buckets = new Map<string, { date: string; revenue: number; orders: number }>();
    for (const p of series) {
      const d = new Date(p.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (b) { b.revenue += p.revenue; b.orders += p.orders; }
      else buckets.set(key, { date: key, revenue: p.revenue, orders: p.orders });
    }
    return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [series, grain]);

  const n = points.length;
  const empty = n === 0 || points.every((p) => p.revenue === 0 && p.orders === 0);
  const maxRev = niceMax(Math.max(0, ...points.map((p) => p.revenue)));
  const maxOrd = niceMax(Math.max(0, ...points.map((p) => p.orders)));
  const revTicks = [maxRev, (maxRev * 3) / 4, maxRev / 2, maxRev / 4, 0];
  const ordTicks = [maxOrd, (maxOrd * 3) / 4, maxOrd / 2, maxOrd / 4, 0];
  // Points sit at the centre of n equal columns so labels line up beneath them.
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const yRev = (v: number) => 100 - (v / maxRev) * 100;
  const yOrd = (v: number) => 100 - (v / maxOrd) * 100;

  const revPts: [number, number][] = points.map((p, i) => [x(i), yRev(p.revenue)]);
  const ordPts: [number, number][] = points.map((p, i) => [x(i), yOrd(p.orders)]);
  const area = (pts: [number, number][]) => (pts.length < 2 ? "" : `${smoothPath(pts)} L${pts[pts.length - 1][0]},100 L${pts[0][0]},100 Z`);
  const label = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  return (
    <div className={CARD}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-base font-semibold text-admin-gray-900"><ChartBar className="h-5 w-5" style={{ color: REV_COLOR }} /> Revenue & Orders Overview</h3>
        <div className="flex items-center gap-5 text-[13px] text-admin-gray-700">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: REV_COLOR }} /> Revenue</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: ORD_COLOR }} /> Orders</span>
          <select value={grain} onChange={(e) => setGrain(e.target.value as "daily" | "weekly")}
            className="h-8 rounded-[0.375rem] border border-[#dee2e6] bg-white px-2 text-xs font-medium text-admin-gray-700 focus:outline-none">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      <div className="flex min-h-[220px] gap-3">
        {/* left axis — revenue */}
        <div className="flex shrink-0 flex-col text-right text-[11px] leading-none text-admin-gray-500">
          <div className="flex flex-1 flex-col justify-between">
            {revTicks.map((t, i) => <span key={i} className={cn("-my-[5px]", i === revTicks.length - 1 && "text-admin-gray-300")}>{moneyShort(t)}</span>)}
          </div>
          <div className="h-6" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1" onMouseLeave={() => setHover(null)}>
            {revTicks.map((_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-dashed border-admin-gray-100" style={{ top: `${(i / (revTicks.length - 1)) * 100}%` }} />
            ))}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <defs>
                <linearGradient id="a2-fill-rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={REV_COLOR} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={REV_COLOR} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="a2-fill-ord" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ORD_COLOR} stopOpacity="0.12" />
                  <stop offset="100%" stopColor={ORD_COLOR} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area(ordPts)} fill="url(#a2-fill-ord)" />
              <path d={area(revPts)} fill="url(#a2-fill-rev)" />
              <path d={smoothPath(ordPts)} fill="none" stroke={ORD_COLOR} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <path d={smoothPath(revPts)} fill="none" stroke={REV_COLOR} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            {/* dots as HTML so they stay round when the plot stretches */}
            {ordPts.map(([px, py], i) => <span key={`o${i}`} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${px}%`, top: `${py}%`, background: ORD_COLOR }} />)}
            {revPts.map(([px, py], i) => <span key={`r${i}`} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${px}%`, top: `${py}%`, background: REV_COLOR }} />)}
            {/* hover columns + tooltip */}
            {points.map((p, i) => (
              <div key={p.date} className="absolute bottom-0 top-0" style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }} onMouseEnter={() => setHover(i)}>
                {hover === i && (
                  <>
                    <div className="absolute bottom-0 left-1/2 top-0 border-l border-admin-gray-200" />
                    <div className={cn("absolute top-1 z-10 w-max rounded-lg border border-admin-gray-200 bg-white px-3 py-2 text-xs shadow-md", i >= n - 2 ? "right-1/2 mr-2" : "left-1/2 ml-2")}>
                      <div className="mb-1 font-semibold text-admin-gray-900">{label(p.date)}</div>
                      <div className="flex items-center gap-2 text-admin-gray-600"><span className="h-2 w-2 rounded-full" style={{ background: REV_COLOR }} /> Revenue: <b className="text-admin-gray-900">{formatMoney(p.revenue)}</b></div>
                      <div className="flex items-center gap-2 text-admin-gray-600"><span className="h-2 w-2 rounded-full" style={{ background: ORD_COLOR }} /> Orders: <b className="text-admin-gray-900">{p.orders}</b></div>
                    </div>
                  </>
                )}
              </div>
            ))}
            {empty && <div className="absolute inset-0 flex items-center justify-center text-sm text-admin-gray-400">No sales in this period</div>}
          </div>
          <div className="grid h-6 items-end whitespace-nowrap text-center text-[10px] text-admin-gray-500 sm:text-xs" style={{ gridTemplateColumns: `repeat(${n || 1}, minmax(0, 1fr))` }}>
            {points.map((p) => <span key={p.date}>{label(p.date)}</span>)}
          </div>
        </div>

        {/* right axis — orders */}
        <div className="flex shrink-0 flex-col text-left text-[11px] leading-none text-admin-gray-500">
          <div className="flex flex-1 flex-col justify-between">
            {ordTicks.map((t, i) => <span key={i} className={cn("-my-[5px]", i === ordTicks.length - 1 && "text-admin-gray-300")}>{Math.round(t)}</span>)}
          </div>
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── payment donut ───────────────────────── */

function PaymentDonut({ slices, grand }: { slices: Analytics2Data["payment"]["slices"]; grand: number }) {
  const R = 15.9155; // circumference ≈ 100, so each stroke-dasharray unit = 1%
  let offset = 0;
  return (
    <div className={CARD}>
      <h3 className="mb-4 text-base font-bold text-admin-gray-900">Sales by Payment Method</h3>
      {slices.length === 0 ? (
        <p className="py-8 text-center text-sm text-admin-gray-400">No paid orders in this period.</p>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <div className="relative h-40 w-40 shrink-0">
            <svg viewBox="0 0 36 36" className="h-40 w-40 -rotate-90">
              <circle cx="18" cy="18" r={R} fill="none" stroke="#f1f5f9" strokeWidth="4.5" />
              {slices.map((s) => {
                const dash = `${s.pct} ${100 - s.pct}`;
                const el = <circle key={s.method} cx="18" cy="18" r={R} fill="none" stroke={s.color} strokeWidth="4.5" strokeDasharray={dash} strokeDashoffset={-offset} strokeLinecap="butt" />;
                offset += s.pct;
                return el;
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-admin-gray-900">{formatMoney(grand)}</span>
              <span className="text-xs text-admin-gray-500">Net Sales</span>
            </div>
          </div>
          <div className="w-full flex-1">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-admin-gray-400"><th className="pb-2 font-medium">Method</th><th className="pb-2 font-medium">Amount</th><th className="pb-2 text-right font-medium">% Share</th></tr></thead>
              <tbody>
                {slices.map((s) => (
                  <tr key={s.method} className="border-t border-admin-gray-100">
                    <td className="flex items-center gap-2 py-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />{s.label}</td>
                    <td className="py-2 text-admin-gray-700">{formatMoney(s.amount)}</td>
                    <td className="py-2 text-right font-semibold text-admin-gray-900">{s.pct}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t border-admin-gray-200 font-bold text-admin-gray-900"><td className="pt-2">Total</td><td className="pt-2">{formatMoney(grand)}</td><td className="pt-2 text-right">100%</td></tr></tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── top products ───────────────────────── */

function TopProducts({ products }: { products: Analytics2Data["current"]["topProducts"] }) {
  return (
    <div className={CARD}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-admin-gray-900">Top Products</h3>
        <Link href="/admin/ecommerce/products2" className="flex items-center gap-1 text-sm font-medium text-[#2563eb] hover:underline">View All Products <ChevronRight className="h-3.5 w-3.5" /></Link>
      </div>
      {products.length === 0 ? <p className="py-8 text-center text-sm text-admin-gray-400">No sales in this period.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b border-admin-gray-100 text-left text-xs uppercase text-admin-gray-400"><th className="pb-2 font-medium">Product</th><th className="pb-2 font-medium">Units Sold</th><th className="pb-2 text-right font-medium">Revenue</th></tr></thead>
            <tbody>
              {products.slice(0, 6).map((p) => (
                <tr key={p.productId} className="border-b border-admin-gray-50 last:border-0">
                  <td className="flex items-center gap-3 py-2.5">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image.startsWith("http") ? p.image : `/${p.image}`} alt="" className="h-10 w-10 shrink-0 rounded-[0.375rem] border border-admin-gray-200 object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.375rem] bg-admin-gray-100 text-admin-gray-300"><ImageIcon className="h-4 w-4" /></span>
                    )}
                    <a href={`/admin/ecommerce/products2?q=${encodeURIComponent(p.name)}`} className="truncate font-medium text-admin-gray-900 hover:text-[#2563eb] hover:underline">{p.name}</a>
                  </td>
                  <td className="py-2.5 text-admin-gray-600">{formatInt(p.unitsSold)}</td>
                  <td className="py-2.5 text-right font-semibold text-admin-gray-900">{formatMoney(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── category breakdown ───────────────────────── */

function CategoryBreakdown({ categories }: { categories: Analytics2Data["current"]["categoryBreakdown"] }) {
  const max = Math.max(1, ...categories.map((c) => c.revenue));
  const COLORS = ["#7c3aed", "#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#0891b2"];
  return (
    <div className={CARD}>
      <h3 className="mb-4 text-base font-bold text-admin-gray-900">Revenue by Category</h3>
      {categories.length === 0 ? <p className="py-8 text-center text-sm text-admin-gray-400">No sales in this period.</p> : (
        <div className="space-y-3">
          {categories.slice(0, 6).map((c, i) => (
            <div key={c.categoryId ?? "none"}>
              <div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium text-admin-gray-800">{c.categoryName}</span><span className="text-admin-gray-500">{formatMoney(c.revenue)}</span></div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-admin-gray-100">
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, (c.revenue / max) * 100)}%`, background: COLORS[i % COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── insight + customers ───────────────────────── */

function InsightCard({ delta, sparkline }: { delta: Delta; sparkline: number[] }) {
  const up = delta.direction === "up";
  const max = Math.max(1, ...sparkline);
  const pts = sparkline.map((v, i) => `${sparkline.length > 1 ? (i / (sparkline.length - 1)) * 100 : 0},${40 - (v / max) * 40}`).join(" ");
  return (
    <div className={cn(CARD, "flex flex-col items-center justify-center text-center", up ? "bg-emerald-50/40" : delta.direction === "down" ? "bg-red-50/40" : "")}>
      <span className={cn("mb-2 flex h-10 w-10 items-center justify-center rounded-full", up ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600")}>
        {up ? <ArrowUpRight className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
      </span>
      <p className="text-sm font-semibold text-admin-gray-900">{up ? "Great job! Your revenue is up" : delta.direction === "down" ? "Your revenue is down" : "Revenue is steady"}</p>
      {delta.pct !== null && <p className={cn("text-2xl font-bold", up ? "text-emerald-600" : "text-red-600")}>{Math.abs(delta.pct)}%</p>}
      <p className="text-xs text-admin-gray-500">vs previous period</p>
      {sparkline.length > 1 && (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={cn("mt-3 h-8 w-28", up ? "text-emerald-500" : "text-red-500")}>
          <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <p className="mt-2 text-xs text-admin-gray-400">Keep up the momentum!</p>
    </div>
  );
}

function CustomersCard({ data }: { data: Analytics2Data["current"]["newVsReturningCustomers"] }) {
  const total = data.newCustomers + data.returningCustomers;
  return (
    <div className={CARD}>
      <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-admin-gray-900"><Users className="h-4 w-4 text-admin-gray-400" /> New vs Returning Customers</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-[0.5rem] bg-violet-50 p-3 text-center"><UserPlus className="mx-auto mb-1 h-5 w-5 text-violet-600" /><div className="text-xl font-bold text-admin-gray-900">{data.newCustomers}</div><div className="text-xs text-admin-gray-600">New</div></div>
        <div className="rounded-[0.5rem] bg-blue-50 p-3 text-center"><UserCheck className="mx-auto mb-1 h-5 w-5 text-blue-600" /><div className="text-xl font-bold text-admin-gray-900">{data.returningCustomers}</div><div className="text-xs text-admin-gray-600">Returning</div></div>
      </div>
      {total > 0 && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-admin-gray-100">
          <div className="h-full bg-violet-500" style={{ width: `${(data.newCustomers / total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── body ───────────────────────── */

export function Analytics2Body({ data, rangeLabel, compare }: { data: Analytics2Data; rangeLabel: string; compare: boolean }) {
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const revSpark = data.dailySeries.map((d) => d.revenue);

  return (
    <div className={cn("mt-5 space-y-5", !loaded && "invisible")}>
      {show("a2-cards") && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {show("a2-k-gross") && <StatCard2 icon={IndianRupee} tint="bg-violet-50 text-violet-600" label="Gross Sales" value={formatMoney(data.grossSales)} delta={data.deltas.grossSales} sparkline={revSpark} compare={compare} />}
          {show("a2-k-net") && <StatCard2 icon={Wallet} tint="bg-emerald-50 text-emerald-600" label="Net Sales" value={formatMoney(data.netSales)} delta={data.deltas.netSales} sparkline={revSpark} compare={compare} />}
          {show("a2-k-orders") && <StatCard2 icon={ShoppingCart} tint="bg-blue-50 text-blue-600" label="Orders" value={formatInt(data.current.totalOrders)} delta={data.deltas.orders} sparkline={data.dailySeries.map((d) => d.orders)} compare={compare} />}
          {show("a2-k-aov") && <StatCard2 icon={Receipt} tint="bg-amber-50 text-amber-600" label="Avg Order Value" value={formatMoney(data.current.avgOrderValue)} delta={data.deltas.avgOrderValue} sparkline={revSpark} compare={compare} />}
        </div>
      )}

      {show("a2-widgets") && show("a2-chart") && <RevenueOrdersChart series={data.dailySeries} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {show("a2-widgets") && show("a2-payment") && <PaymentDonut slices={data.payment.slices} grand={data.payment.grand} />}
          {show("a2-widgets") && show("a2-top") && <TopProducts products={data.current.topProducts} />}
        </div>
        <div className="space-y-5">
          {show("a2-widgets") && show("a2-insight") && compare && <InsightCard delta={data.deltas.netSales} sparkline={revSpark} />}
          {show("a2-widgets") && show("a2-customers") && <CustomersCard data={data.current.newVsReturningCustomers} />}
          {show("a2-widgets") && show("a2-category") && <CategoryBreakdown categories={data.current.categoryBreakdown} />}
        </div>
      </div>

      <p className="text-center text-xs text-admin-gray-400">Showing data for {rangeLabel}. Figures are computed from real orders — no visit/page-view tracking exists yet, so top-of-funnel metrics (visits, product views, add-to-cart) aren&apos;t shown.</p>
    </div>
  );
}
