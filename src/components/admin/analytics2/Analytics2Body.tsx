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

/* ───────────────────────── dual-line chart ───────────────────────── */

function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  if (points.length === 2) return `M${points[0][0]},${points[0][1]} L${points[1][0]},${points[1][1]}`;
  const d: string[] = [`M${points[0][0]},${points[0][1]}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d.push(`C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`);
  }
  return d.join(" ");
}

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
  const empty = n === 0;
  const maxRev = Math.max(1, ...points.map((p) => p.revenue));
  const maxOrd = Math.max(1, ...points.map((p) => p.orders));
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const yRev = (v: number) => 100 - (v / maxRev) * 100;
  const yOrd = (v: number) => 100 - (v / maxOrd) * 100;
  const revPath = smoothPath(points.map((p, i) => [x(i), yRev(p.revenue)]));
  const ordPath = smoothPath(points.map((p, i) => [x(i), yOrd(p.orders)]));
  const label = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  return (
    <div className={CARD}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-bold text-admin-gray-900"><ChartBar className="h-4 w-4 text-admin-gray-400" /> Revenue & Orders Overview</h3>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-admin-gray-600"><span className="h-2 w-2 rounded-full bg-[#7c3aed]" /> Revenue</span>
          <span className="flex items-center gap-1.5 text-xs text-admin-gray-600"><span className="h-2 w-2 rounded-full bg-[#2563eb]" /> Orders</span>
          <select value={grain} onChange={(e) => setGrain(e.target.value as "daily" | "weekly")}
            className="h-8 rounded-[0.375rem] border border-[#dee2e6] bg-white px-2 text-xs font-medium text-admin-gray-700 focus:outline-none">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      {empty ? (
        <div className="flex h-48 flex-col items-center justify-center text-center">
          <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-admin-gray-100 text-admin-gray-400"><ChartBar className="h-5 w-5" /></span>
          <p className="text-sm font-semibold text-admin-gray-900">No sales in this period</p>
        </div>
      ) : (
        <>
          <div className="relative h-56" onMouseLeave={() => setHover(null)}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <path d={revPath} fill="none" stroke="#7c3aed" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path d={ordPath} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" strokeDasharray="4 3" />
            </svg>
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
              {points.map((p, i) => <div key={p.date} onMouseEnter={() => setHover(i)} />)}
            </div>
            {hover !== null && (
              <div className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3 py-2 shadow-lg"
                style={{ left: `clamp(60px, ${x(hover)}%, calc(100% - 60px))`, top: `calc(${Math.min(yRev(points[hover].revenue), yOrd(points[hover].orders))}% - 60px)` }}>
                <div className="text-[0.6875rem] text-admin-gray-500">{label(points[hover].date)}</div>
                <div className="text-sm font-bold text-[#7c3aed]">{formatMoney(points[hover].revenue)}</div>
                <div className="text-xs font-medium text-[#2563eb]">{points[hover].orders} order{points[hover].orders === 1 ? "" : "s"}</div>
              </div>
            )}
          </div>
          <div className="mt-2 flex justify-between text-[0.6875rem] text-admin-gray-400">
            <span>{label(points[0].date)}</span>
            {n > 2 && <span>{label(points[Math.floor((n - 1) / 2)].date)}</span>}
            <span>{label(points[n - 1].date)}</span>
          </div>
        </>
      )}
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
