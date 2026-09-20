"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  TrendingUp, BarChart3, CalendarDays, CalendarRange, ArrowRight, IndianRupee, ShoppingCart, Wallet,
  ArrowUp, ArrowDown, ChevronDown, ChevronLeft, ChevronRight, FileText, Globe, ChevronsUpDown, Loader2, HandCoins, CheckCircle2, X,
} from "lucide-react";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { ChartSeries, FilterOptions, LedgerRow, Metric, SalesFilters, SalesMetrics } from "@/lib/sales-history2";
import { cn } from "@/lib/utils";

const PAGE_PATH = "/admin/ecommerce/sales-history2";

/* ───────────────────────── formatting (same on server and browser) ───────────────────────── */

const money = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyShort = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Every date/time on this page is shown in India time, so the server render
 *  and the browser always produce identical text. */
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
const dateParts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
function fmtTime(iso: string) {
  return timeFmt.format(new Date(iso));
}
function fmtDate(iso: string) {
  const p = Object.fromEntries(dateParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}`; // 18 Sep 2026
}
/** 2026-09-01 → 01/09/2026 */
const dmy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/** Today's date in India time (YYYY-MM-DD), for the date-range presets. */
function istTodayYmd() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
function shiftYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ───────────────────────── page body ───────────────────────── */

interface Props {
  rows: LedgerRow[];
  metrics: SalesMetrics;
  chart: ChartSeries;
  filters: SalesFilters;
  isDefaultRange: boolean;
  options: FilterOptions;
}

export function SalesHistory2Body({ rows, metrics, chart, filters, isDefaultRange, options }: Props) {
  const { isVisible, loaded } = useDashboardWidgetPrefs();
  const showChart = isVisible("sh2-chart");
  const showMetrics = isVisible("sh2-metrics");
  const router = useRouter();
  const [loading, startLoading] = useTransition();

  // Every filter change goes through here: stay at the same scroll position
  // (Next.js would jump to the top) and mark the page as loading until the
  // new data has arrived, so a click is never followed by "nothing happened".
  const navigate = (url: string) => startLoading(() => router.push(url, { scroll: false }));
  const filterKey = `${filters.from}|${filters.to}|${filters.status}|${filters.payment}|${filters.customer}|${filters.product}|${filters.q}`;
  const dim = cn("transition-opacity duration-150", loading && "pointer-events-none opacity-50");

  return (
    // Invisible (space kept) until saved Display Options are read, so hidden
    // cards don't flash in and jump away on every open/refresh.
    <div className={cn("relative space-y-5", !loaded && "invisible")} aria-busy={loading}>
      {loading && (
        <div className="fixed left-0 right-0 top-0 z-[300] h-0.5 overflow-hidden bg-blue-100" role="progressbar" aria-label="Loading sales">
          <div className="h-full w-1/3 animate-[sh2-progress_1s_ease-in-out_infinite] bg-blue-600" />
          <style>{`@keyframes sh2-progress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
        </div>
      )}
      {(showChart || showMetrics) && (
        <div className={cn("grid grid-cols-1 gap-5", dim, showChart && showMetrics && "min-[1600px]:grid-cols-[minmax(0,1fr)_minmax(0,1.18fr)]")}>
          {showChart && <SalesPerformanceCard chart={chart} />}
          {showMetrics && <KeyMetricsCard metrics={metrics} filters={filters} isDefaultRange={isDefaultRange} />}
        </div>
      )}
      {isVisible("sh2-filters") && <FilterSalesCard filters={filters} options={options} navigate={navigate} pending={loading} />}
      {isVisible("sh2-ledger") && (
        <div className={dim}>
          <SalesLedgerCard rows={rows} resetKey={filterKey} />
        </div>
      )}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-admin-gray-200 bg-white shadow-sm", className)}>{children}</section>;
}

/* ───────────────────────── Sales Performance ───────────────────────── */

const GREEN = "#16a34a";
const BLUE = "#2563eb";

/** A round axis maximum: the next 1/1.5/2/2.5/3/4/5/6/8 × 10ⁿ above the data. */
function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * Smooth line through every point using monotone cubic interpolation
 * (Fritsch–Carlson). Unlike a plain Catmull-Rom spline, it never bulges past
 * its neighbouring points: between two weeks the line stays between their
 * two values, so it can't dip below ₹0 or peak above a real total — on a
 * money chart that would show sales that never happened.
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

function SalesPerformanceCard({ chart }: { chart: ChartSeries }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = chart.labels.length;
  const thisVals = chart.thisMonth;
  const max = niceMax(Math.max(0, ...chart.prevMonth, ...thisVals.map((v) => v ?? 0)));
  const ticks = [max, (max * 3) / 4, max / 2, max / 4, 0];
  // Points sit at the centre of n equal columns so labels line up beneath them.
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (v / max) * 100;

  const prevPts: [number, number][] = chart.prevMonth.map((v, i) => [x(i), y(v)]);
  const thisPts: [number, number][] = thisVals.flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as [number, number]]));
  const area = (pts: [number, number][]) =>
    pts.length < 2 ? "" : `${smoothPath(pts)} L${pts[pts.length - 1][0]},100 L${pts[0][0]},100 Z`;
  const allZero = chart.prevMonth.every((v) => v === 0) && thisVals.every((v) => !v);

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-semibold text-admin-gray-900">
          <TrendingUp className="h-5 w-5" style={{ color: GREEN }} /> Sales Performance
        </h2>
        <div className="flex items-center gap-5 text-[13px] text-admin-gray-700">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: GREEN }} /> This Month</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: BLUE }} /> Previous Month</span>
        </div>
      </div>

      {/* Grows to the card's height, so it lines up with Key Metrics beside it. */}
      <div className="flex min-h-[180px] flex-1 gap-3">
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
            {/* grid lines */}
            {ticks.map((_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-dashed border-admin-gray-100" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
            ))}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <defs>
                <linearGradient id="sh2-fill-green" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GREEN} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="sh2-fill-blue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BLUE} stopOpacity="0.12" />
                  <stop offset="100%" stopColor={BLUE} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area(prevPts)} fill="url(#sh2-fill-blue)" />
              <path d={area(thisPts)} fill="url(#sh2-fill-green)" />
              <path d={smoothPath(prevPts)} fill="none" stroke={BLUE} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <path d={smoothPath(thisPts)} fill="none" stroke={GREEN} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            {/* dots as HTML so they stay round when the plot stretches */}
            {prevPts.map(([px, py], i) => (
              <span key={`p${i}`} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${px}%`, top: `${py}%`, background: BLUE }} />
            ))}
            {thisVals.map((v, i) =>
              v === null ? null : (
                <span key={`t${i}`} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${x(i)}%`, top: `${y(v)}%`, background: GREEN }} />
              )
            )}
            {/* hover columns + tooltip */}
            {chart.labels.map((label, i) => (
              <div key={label} className="absolute bottom-0 top-0" style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }} onMouseEnter={() => setHover(i)}>
                {hover === i && (
                  <>
                    <div className="absolute bottom-0 left-1/2 top-0 border-l border-admin-gray-200" />
                    <div className={cn("absolute top-1 z-10 w-max rounded-lg border border-admin-gray-200 bg-white px-3 py-2 text-xs shadow-md", i >= n - 2 ? "right-1/2 mr-2" : "left-1/2 ml-2")}>
                      <div className="mb-1 font-semibold text-admin-gray-900">{label}</div>
                      <div className="flex items-center gap-2 text-admin-gray-600">
                        <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />
                        {chart.thisMonthName}: <b className="text-admin-gray-900">{thisVals[i] === null ? "—" : money(thisVals[i] ?? 0)}</b>
                      </div>
                      <div className="flex items-center gap-2 text-admin-gray-600">
                        <span className="h-2 w-2 rounded-full" style={{ background: BLUE }} />
                        {chart.prevMonthName}: <b className="text-admin-gray-900">{money(chart.prevMonth[i])}</b>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
            {allZero && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-admin-gray-400">No sales in these two months yet</div>
            )}
          </div>
          <div className="grid h-6 items-end whitespace-nowrap text-center text-[10px] text-admin-gray-500 sm:text-xs" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {chart.labels.map((l) => <span key={l}>{l}</span>)}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────── Key Metrics ───────────────────────── */

function KeyMetricsCard({ metrics, filters, isDefaultRange }: { metrics: SalesMetrics; filters: SalesFilters; isDefaultRange: boolean }) {
  const { isVisible } = useDashboardWidgetPrefs();
  const tiles: { key: string; node: React.ReactNode }[] = [
    {
      key: "sh2-m-total",
      node: (
        <MetricTile
          icon={IndianRupee}
          tone="green"
          label={`Total Sales (${isDefaultRange ? "This Month" : "Selected Range"})`}
          metric={isDefaultRange ? metrics.month : metrics.rangeTotal}
          emptyText="No sales in this range"
        />
      ),
    },
    { key: "sh2-m-today", node: <MetricTile icon={ShoppingCart} tone="blue" label="Today's Sale" metric={metrics.today} emptyText="No sales today" /> },
    { key: "sh2-m-yesterday", node: <MetricTile icon={CalendarDays} tone="navy" label="Yesterday's Sale" metric={metrics.yesterday} emptyText="No sales yesterday" /> },
    { key: "sh2-m-week", node: <MetricTile icon={CalendarRange} tone="green" label="This Week's Sale" metric={metrics.week} emptyText="No sales this week" /> },
    { key: "sh2-m-month", node: <MetricTile icon={CalendarDays} tone="blue" label="This Month's Sale" metric={metrics.month} emptyText="No sales this month" /> },
    { key: "sh2-m-due", node: <DueTile collected={metrics.dueCollectedToday} outstanding={metrics.dueOutstanding} /> },
  ].filter((t) => isVisible(t.key));

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-semibold text-admin-gray-900">
          <BarChart3 className="h-5 w-5" style={{ color: GREEN }} /> Key Metrics
        </h2>
        <div className="flex items-center gap-2 rounded-lg bg-admin-gray-50 px-3 py-1.5 text-[13px] text-admin-gray-700">
          <CalendarDays className="h-3.5 w-3.5 text-admin-gray-500" />
          {dmy(filters.from)}
          <ArrowRight className="h-3.5 w-3.5 text-admin-gray-400" />
          {dmy(filters.to)}
        </div>
      </div>
      {tiles.length === 0 ? (
        <p className="py-6 text-center text-sm text-admin-gray-400">All metrics are hidden — turn them on from Display Options.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => <div key={t.key}>{t.node}</div>)}
        </div>
      )}
    </Card>
  );
}

const TONES = {
  green: { bg: "bg-emerald-600", text: "text-emerald-600" },
  blue: { bg: "bg-blue-600", text: "text-blue-600" },
  navy: { bg: "bg-blue-600", text: "text-slate-800" },
  amber: { bg: "bg-amber-400", text: "text-amber-500" },
} as const;

function TileShell({ icon: Icon, tone, label, value, children }: {
  icon: React.ComponentType<{ className?: string }>; tone: keyof typeof TONES; label: string; value: string; children: React.ReactNode;
}) {
  return (
    <div className="flex h-full gap-2.5 rounded-xl border border-admin-gray-100 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white", TONES[tone].bg)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs leading-5 text-admin-gray-700" title={label}>{label}</div>
        <div className={cn("whitespace-nowrap text-xl font-bold leading-8 tracking-tight", TONES[tone].text)}>{value}</div>
        <div className="truncate whitespace-nowrap text-xs leading-5">{children}</div>
      </div>
    </div>
  );
}

function MetricTile({ icon, tone, label, metric, emptyText }: {
  icon: React.ComponentType<{ className?: string }>; tone: keyof typeof TONES; label: string; metric: Metric; emptyText: string;
}) {
  let sub: React.ReactNode;
  if (metric.change !== null) {
    const up = metric.change >= 0;
    sub = (
      <span className={cn("inline-flex items-center gap-1", up ? "text-emerald-600" : "text-red-500")}>
        {up ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />}
        {Math.abs(metric.change)}% {metric.compareLabel}
      </span>
    );
  } else {
    sub = <span className="text-admin-gray-500">— {metric.value > 0 ? "No data to compare" : emptyText}</span>;
  }
  return <TileShell icon={icon} tone={tone} label={label} value={money(metric.value)}>{sub}</TileShell>;
}

function DueTile({ collected, outstanding }: { collected: number; outstanding: number }) {
  return (
    <TileShell icon={Wallet} tone="amber" label="Today's Due Collection" value={money(collected)}>
      {outstanding > 0.004 ? (
        <Link href="/admin/ecommerce/due" className="text-amber-600 hover:underline">{money(outstanding)} still due</Link>
      ) : (
        <span className="text-admin-gray-500">— All collected</span>
      )}
    </TileShell>
  );
}

/* ───────────────────────── Filter Sales ───────────────────────── */

type Preset = { key: string; label: string; range: [string, string] };

/** The EduMint range presets, computed in India time. */
function rangePresets(): Preset[] {
  const today = istTodayYmd();
  const firstThis = `${today.slice(0, 8)}01`;
  const lastPrev = shiftYmd(firstThis, -1);
  return [
    { key: "today", label: "Today", range: [today, today] },
    { key: "yesterday", label: "Yesterday", range: [shiftYmd(today, -1), shiftYmd(today, -1)] },
    { key: "7days", label: "7 Days", range: [shiftYmd(today, -6), today] },
    { key: "this_month", label: "This Month", range: [firstThis, today] },
    { key: "prev_month", label: "Previous Month", range: [`${lastPrev.slice(0, 8)}01`, lastPrev] },
  ];
}

/** 2026-09-01 → "01 Sep 2026" */
function longDate(ymd: string) {
  return fmtDate(`${ymd}T12:00:00Z`);
}

/**
 * Filter Sales, in the original EduMint range-bar style:
 *   Showing: <range>   [Today|Yesterday|7 Days|This Month|Previous Month]   [from] to [to] [Apply]
 * followed by Order Status / Payment Status / Customer / Items-Product.
 *
 * Presets and the four dropdowns apply at once; the from–to dates apply with
 * Apply (a range means changing two boxes, so applying after the first one
 * would load a half-chosen range). Every other current choice is kept.
 */
function FilterSalesCard({ filters, options, navigate, pending }: {
  filters: SalesFilters; options: FilterOptions; navigate: (url: string) => void; pending: boolean;
}) {
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [status, setStatus] = useState<string>(filters.status);
  const [payment, setPayment] = useState<string>(filters.payment);
  const [customer, setCustomer] = useState(filters.customer);
  const [product, setProduct] = useState(filters.product);

  // Back/forward navigation or a preset click changes the URL: follow it.
  useEffect(() => {
    setFrom(filters.from); setTo(filters.to); setStatus(filters.status); setPayment(filters.payment);
    setCustomer(filters.customer); setProduct(filters.product);
  }, [filters]);

  const presets = rangePresets();
  const activePreset = presets.find((p) => p.range[0] === filters.from && p.range[1] === filters.to);
  const showing = activePreset
    ? activePreset.label
    : filters.from === filters.to
    ? longDate(filters.from)
    : `${longDate(filters.from)} – ${longDate(filters.to)}`;

  type Choice = { status: string; payment: string; customer: string; product: string };

  function go(a: string, b: string, choice: Choice = { status, payment, customer, product }) {
    const [f, t] = a <= b ? [a, b] : [b, a];
    const p = new URLSearchParams({ from: f, to: t });
    if (choice.status !== "all") p.set("status", choice.status);
    if (choice.payment !== "all") p.set("payment", choice.payment);
    if (choice.customer) p.set("customer", choice.customer);
    if (choice.product) p.set("product", choice.product);
    if (filters.q) p.set("q", filters.q);
    navigate(`${PAGE_PATH}?${p.toString()}`);
  }

  /** Dropdowns filter live: the new choice applies the moment it's picked,
   *  together with whatever dates are in the date boxes. */
  function pick(key: keyof Choice, value: string) {
    const choice: Choice = { status, payment, customer, product, [key]: value };
    setStatus(choice.status); setPayment(choice.payment); setCustomer(choice.customer); setProduct(choice.product);
    go(from || filters.from, to || filters.to, choice);
  }

  const ctl =
    "h-[31px] rounded-[0.25rem] border border-admin-gray-300 bg-white text-[0.8125rem] text-admin-gray-700 focus:border-admin-primary focus:outline-none";

  return (
    <Card className="px-4 py-3">
      {/* One row: presets · Order Status · Payment Status · Customer · Items/Product · from–to · Apply.
          It wraps onto a second line only when the screen is too narrow. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (from && to) go(from, to);
        }}
        className="flex flex-wrap items-center gap-2"
        aria-label="Filter sales"
      >
        {/* EduMint .btn-group */}
        <div className="inline-flex max-w-full shrink-0 overflow-x-auto" role="group" aria-label="Date range presets">
          {presets.map((p, i) => {
            const active = activePreset?.key === p.key;
            return (
              <button
                key={p.key}
                type="button"
                disabled={pending}
                aria-pressed={active}
                onClick={() => go(p.range[0], p.range[1])}
                className={cn(
                  "relative h-[31px] whitespace-nowrap border px-2 text-[0.8125rem] leading-none transition-colors",
                  i === 0 && "rounded-l-[0.25rem]",
                  i === presets.length - 1 && "rounded-r-[0.25rem]",
                  i > 0 && "-ml-px",
                  active
                    ? "z-10 border-[#0d6efd] bg-[#0d6efd] text-white"
                    : "border-[#6c757d] bg-transparent text-[#6c757d] hover:bg-[#6c757d] hover:text-white"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Four filters, each labelled by its "All …" option and a tooltip */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:min-w-[420px] sm:flex-1 sm:flex-nowrap sm:items-center">
          <InlineSelect value={status} onChange={(v) => pick("status", v)} label="Order Status" className={ctl} grow="sm:flex-[0.85]">
            <option value="all">All Status</option>
            <option value="Delivered">Delivered</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Canceled">Canceled</option>
          </InlineSelect>
          <InlineSelect value={payment} onChange={(v) => pick("payment", v)} label="Payment Status" className={ctl} grow="sm:flex-[1.02]">
            <option value="all">All Payments</option>
            <option value="paid">Paid</option>
            <option value="due">Due</option>
            <option value="due_cleared">Due Cleared</option>
          </InlineSelect>
          <InlineSelect value={customer} onChange={(v) => pick("customer", v)} label="Customer" className={ctl} grow="sm:flex-[1.1]">
            <option value="">All Customers</option>
            <option value="guest">Walk-in / Guest</option>
            {options.customers.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
            ))}
          </InlineSelect>
          <InlineSelect value={product} onChange={(v) => pick("product", v)} label="Items / Product" className={ctl} grow="sm:flex-[1.05]">
            <option value="">All Products</option>
            {options.products.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </InlineSelect>
        </div>

        {/* EduMint .range-bar-custom */}
        <div className="ml-auto flex flex-wrap items-center gap-[0.4rem]">
          <input
            type="date"
            aria-label="Range start date"
            title={`Showing: ${showing}`}
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className={cn(ctl, "w-[112px] px-1.5 sm:w-[132px] sm:px-2")}
          />
          <span className="text-[0.8125rem] text-[#6c757d]">to</span>
          <input
            type="date"
            aria-label="Range end date"
            title={`Showing: ${showing}`}
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className={cn(ctl, "w-[112px] px-1.5 sm:w-[132px] sm:px-2")}
          />
          <button
            type="submit"
            disabled={pending}
            className="flex h-[31px] items-center gap-1.5 rounded-[0.25rem] border border-[#6c757d] bg-[#6c757d] px-3 text-[0.8125rem] text-white hover:border-[#5c636a] hover:bg-[#5c636a] disabled:opacity-70"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Apply
          </button>
        </div>
      </form>
    </Card>
  );
}

/** Compact select for the one-row filter bar; `label` is its accessible name and tooltip. */
function InlineSelect({ value, onChange, label, className, grow, children }: {
  value: string; onChange: (v: string) => void; label: string; className: string; grow: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("relative min-w-0 sm:max-w-[200px]", grow)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        title={label}
        className={cn(className, "w-full appearance-none truncate pl-2 pr-7")}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-500" />
    </div>
  );
}

/* ───────────────────────── Sales Ledger ───────────────────────── */

type SortKey = "time" | "order" | "customer" | "items" | "payment" | "total" | "paid";

/**
 * Fixed column widths (table-layout: fixed). With automatic layout the
 * browser re-sized every column to whatever rows were on screen, so each
 * filter change made the whole table stretch and shrink sideways. Items has
 * no width: it takes whatever is left.
 */
const COLUMNS: { key: string; sort: SortKey | null; label: string; width?: number }[] = [
  { key: "sh2-c-time", sort: "time", label: "Time", width: 118 },
  { key: "sh2-c-order", sort: "order", label: "Order ID", width: 136 },
  { key: "sh2-c-customer", sort: "customer", label: "Customer", width: 180 },
  { key: "sh2-c-items", sort: "items", label: "Items" },
  { key: "sh2-c-payment", sort: "payment", label: "Payment", width: 112 },
  { key: "sh2-c-total", sort: "total", label: "Total", width: 122 },
  { key: "sh2-c-paid", sort: "paid", label: "Paid", width: 136 },
  { key: "sh2-c-invoice", sort: null, label: "Invoice", width: 88 },
];

/** Height of one ledger row and of the header row (px). Rows are fixed
 *  height, and the table area never gets shorter than LEDGER_MIN_ROWS rows,
 *  so a filter that returns fewer sales doesn't collapse the page under you. */
const ROW_H = 54;
const HEAD_H = 42;
const LEDGER_MIN_ROWS = 10;

function sortValue(r: LedgerRow, k: SortKey): string | number {
  switch (k) {
    case "time": return r.createdAt;
    case "order": return r.orderNumber;
    case "customer": return r.customerName.toLowerCase();
    case "items": return r.itemCount;
    case "payment": return r.paymentMethod.toLowerCase();
    case "total": return r.total;
    case "paid": return r.paid;
  }
}

function SalesLedgerCard({ rows, resetKey }: { rows: LedgerRow[]; resetKey: string }) {
  const { isVisible } = useDashboardWidgetPrefs();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "time", dir: "desc" });
  const [pageSize, setPageSize] = useState(20); // 0 = All
  const [page, setPage] = useState(1);
  const [payRow, setPayRow] = useState<LedgerRow | null>(null);
  const cols = COLUMNS.filter((c) => isVisible(c.key));
  const show = (key: string) => isVisible(key);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? rows.filter((r) =>
          [r.orderNumber, r.customerName, r.itemsSummary, r.paymentMethod, money(r.total)].some((v) => v.toLowerCase().includes(term))
        )
      : rows;
    const sorted = [...list].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const c = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === "asc" ? c : -c;
    });
    return sorted;
  }, [rows, search, sort]);

  const shownTotal = shown.reduce((s, r) => s + r.total, 0);
  const shownDue = shown.reduce((s, r) => s + r.due, 0);

  // Pagination (DataTables-style "Show N entries").
  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pageCount);
  const startIdx = pageSize === 0 ? 0 : (current - 1) * pageSize;
  const pageRows = pageSize === 0 ? shown : shown.slice(startIdx, startIdx + pageSize);
  // A new search, sort, page size or filter starts again from page 1. A plain
  // data refresh (e.g. after recording a due payment) keeps the current page.
  useEffect(() => setPage(1), [search, sort, pageSize, resetKey]);

  function toggleSort(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "time" || k === "total" || k === "paid" ? "desc" : "asc" }));
  }

  return (
    <Card className="p-5">

      {/* Show [20] entries ··········· Search: [      ] */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-admin-gray-800">
        <label className="flex items-center gap-2">
          Show
          <span className="relative">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Entries per page"
              className="h-9 w-[88px] appearance-none rounded-md border border-admin-gray-200 bg-white pl-3 pr-8 text-sm focus:border-admin-primary focus:outline-none"
            >
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={0}>All</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-600" />
          </span>
          entries
        </label>
        <label className="flex items-center gap-2">
          Search:
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search the ledger"
            className="h-9 w-[220px] rounded-md border border-admin-gray-200 bg-white px-2.5 text-sm focus:border-admin-primary focus:outline-none"
          />
        </label>
      </div>

      {cols.length === 0 ? (
        <p className="py-10 text-center text-sm text-admin-gray-400">All ledger columns are hidden — turn them on from Display Options.</p>
      ) : (
        <div className="overflow-x-auto" style={{ minHeight: HEAD_H + LEDGER_MIN_ROWS * ROW_H }}>
          <table className="w-full min-w-[980px] table-fixed border-collapse text-[13px]">
            <colgroup>
              {cols.map((c) => (
                <col key={c.key} style={c.width ? { width: c.width } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-admin-gray-200" style={{ height: HEAD_H }}>
                {cols.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-admin-gray-900">
                    {c.sort ? (
                      <button type="button" onClick={() => toggleSort(c.sort!)} className="flex w-full items-center justify-between gap-2">
                        {c.label}
                        {sort.key === c.sort ? (
                          sort.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-admin-gray-600" /> : <ArrowDown className="h-3.5 w-3.5 text-admin-gray-600" />
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 text-admin-gray-300" />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={cols.length} className="py-12 text-center text-admin-gray-400">
                    {rows.length === 0 ? "No sales match these filters." : "No sales match your search."}
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => (
                  <tr key={r.id} style={{ height: ROW_H }} className="border-b border-admin-gray-100 odd:bg-white even:bg-admin-gray-50/70 hover:bg-emerald-50/40">
                    {show("sh2-c-time") && (
                      <td className="whitespace-nowrap px-3 py-2 align-middle">
                        <div className="text-admin-gray-900">{fmtTime(r.createdAt)}</div>
                        <div className="text-[11px] text-admin-gray-500">{fmtDate(r.createdAt)}</div>
                      </td>
                    )}
                    {show("sh2-c-order") && (
                      <td className="whitespace-nowrap px-3 py-2">
                        <Link href={`/admin/ecommerce/orders/${r.id}`} className="text-blue-600 hover:underline">{r.orderNumber}</Link>
                      </td>
                    )}
                    {show("sh2-c-customer") && (
                      <td className="px-3 py-2">
                        <div className="truncate">
                          {r.customerId ? (
                            <Link href={`/admin/ecommerce/customers/${r.customerId}`} className="text-blue-600 hover:underline" title={r.customerName}>{r.customerName}</Link>
                          ) : (
                            <span className="text-admin-gray-900" title={r.customerName}>{r.customerName}</span>
                          )}
                        </div>
                        {r.orderType === "online" && (
                          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-blue-600" title="Online order">
                            <Globe className="h-3 w-3" />
                          </span>
                        )}
                      </td>
                    )}
                    {show("sh2-c-items") && (
                      <td className="px-3 py-2 text-admin-gray-700">
                        <div className="truncate" title={r.itemsSummary}>{r.itemsSummary}</div>
                      </td>
                    )}
                    {show("sh2-c-payment") && <td className="whitespace-nowrap px-3 py-2 text-admin-gray-800">{r.paymentMethod}</td>}
                    {show("sh2-c-total") && <td className="whitespace-nowrap px-3 py-2 text-admin-gray-900">{money(r.total)}</td>}
                    {show("sh2-c-paid") && (
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="text-admin-gray-900">{money(r.paid)}</div>
                        {r.due > 0.004 && (
                          <button
                            type="button"
                            onClick={() => setPayRow(r)}
                            title="Record a due payment"
                            className="text-xs font-semibold text-red-600 underline underline-offset-2 hover:text-red-700"
                          >
                            Due {money(r.due)}
                          </button>
                        )}
                      </td>
                    )}
                    {show("sh2-c-invoice") && (
                      <td className="px-3 py-2">
                        <InvoiceCell row={r} />
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex min-h-8 flex-wrap items-center justify-between gap-3 text-[13px] text-admin-gray-600">
        <span>
          {shown.length === 0
            ? "Showing 0 entries"
            : `Showing ${startIdx + 1} to ${startIdx + pageRows.length} of ${shown.length} entries`}
          {shown.length !== rows.length && ` (filtered from ${rows.length} total entries)`}
          <span className="mx-2 text-admin-gray-300">|</span>
          Total <b className="text-admin-gray-900">{money(shownTotal)}</b>
          {shownDue > 0.004 && <> · Due <b className="text-red-600">{money(shownDue)}</b></>}
        </span>
        {pageCount > 1 && <Pager page={current} pageCount={pageCount} onPage={setPage} />}
      </div>

      {payRow && <DuePaymentModal row={payRow} onClose={() => setPayRow(null)} />}
    </Card>
  );
}

/**
 * "Record Payment" for a sale's due — the same form and the same
 * /api/ecommerce/due-payment endpoint as EduMint's Due page (amount capped at
 * the balance, Cash/Card/UPI/Other, one receipt). It opens right here from
 * "Due ₹…" in the ledger; after saving it shows the receipt and refreshes the
 * page data so the row's Paid/Due update in place.
 */
function DuePaymentModal({ row, onClose }: { row: LedgerRow; onClose: () => void }) {
  const router = useRouter();
  const balance = Math.round(row.dueCredits.reduce((s, c) => s + c.balance, 0) * 100) / 100;
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState("Cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ receiptHref: string; receipt: string; paid: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Math.round(Math.min(Math.max(0, parseFloat(amount) || 0), balance) * 100) / 100;
    if (amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    // Spread the payment over this sale's open due records, oldest first
    // (almost always just one), so nothing is ever overpaid.
    const creditIds: number[] = [];
    const amounts: number[] = [];
    let left = amt;
    for (const c of row.dueCredits) {
      if (left <= 0.004) break;
      const part = Math.round(Math.min(left, c.balance) * 100) / 100;
      creditIds.push(c.id);
      amounts.push(part);
      left = Math.round((left - part) * 100) / 100;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ecommerce/due-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditIds, amounts, paymentMethod: method, combineReceipt: true }),
      });
      const data = await res.json().catch(() => ({ success: false, message: "Unexpected server response." }));
      if (!data.success) {
        setError(data.message || "Could not save the payment.");
        return;
      }
      const redirect: string = data.redirect || "";
      const receipt = decodeURIComponent(redirect.split("/payment-receipt/")[1] ?? "");
      setDone({
        receipt,
        receiptHref: receipt ? `${redirect}?return_to=${encodeURIComponent(PAGE_PATH)}` : "/admin/ecommerce/due",
        paid: amt,
      });
      router.refresh(); // re-read the ledger, metrics and chart from the server
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Record Payment"
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h5 className="flex items-center gap-2 text-lg font-bold text-admin-gray-900">
            <HandCoins className="h-5 w-5 text-emerald-600" /> Record Payment
          </h5>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-admin-gray-400 hover:bg-admin-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-admin-gray-500">
          {row.customerName} · {row.orderNumber}
        </p>

        {done ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="text-sm">
                <div className="font-semibold text-emerald-800">Payment recorded — {money(done.paid)} ({method})</div>
                {done.receipt && <div className="text-emerald-700">Receipt {done.receipt}</div>}
                <div className="text-emerald-700">
                  {done.paid >= balance - 0.004 ? "Due fully cleared." : `Still due: ${money(Math.round((balance - done.paid) * 100) / 100)}`}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <a href={done.receiptHref} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded bg-admin-gray-100 px-4 py-2 text-sm hover:bg-admin-gray-200">
                <FileText className="h-4 w-4" /> Print Receipt
              </a>
              <button type="button" onClick={onClose} className="rounded bg-admin-primary px-4 py-2 text-sm text-white hover:bg-admin-primary-dark">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg bg-admin-gray-50 px-3 py-2.5 text-center text-xs text-admin-gray-500">
              <div>Total<div className="mt-0.5 text-sm font-semibold text-admin-gray-900">{money(row.total)}</div></div>
              <div>Paid<div className="mt-0.5 text-sm font-semibold text-admin-gray-900">{money(row.paid)}</div></div>
              <div>Balance<div className="mt-0.5 text-sm font-semibold text-red-600">{money(balance)}</div></div>
            </div>
            {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label htmlFor="sh2-pay-amount" className="mb-1 block text-xs font-medium">Amount</label>
                <input
                  id="sh2-pay-amount"
                  type="number"
                  step="0.01"
                  min={0.01}
                  max={balance}
                  required
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded border border-admin-gray-200 px-3 py-2 text-sm focus:border-admin-primary focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="sh2-pay-method" className="mb-1 block text-xs font-medium">Payment Method</label>
                <select
                  id="sh2-pay-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full rounded border border-admin-gray-200 px-3 py-2 text-sm focus:border-admin-primary focus:outline-none"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} disabled={busy} className="rounded bg-admin-gray-100 px-4 py-2 text-sm hover:bg-admin-gray-200">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded bg-admin-primary px-4 py-2 text-sm text-white hover:bg-admin-primary-dark disabled:opacity-60">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {busy ? "Saving…" : "Record Payment"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Previous · 1 2 3 … 9 · Next */
function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = "flex h-8 min-w-8 items-center justify-center border border-admin-gray-200 px-2.5 text-[13px] -ml-px first:ml-0 first:rounded-l-md last:rounded-r-md";
  return (
    <nav className="flex" aria-label="Ledger pages">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={cn(btn, "gap-1 text-admin-gray-700 hover:bg-admin-gray-50 disabled:cursor-not-allowed disabled:text-admin-gray-300 disabled:hover:bg-transparent")}>
        <ChevronLeft className="h-3.5 w-3.5" /> Previous
      </button>
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className={cn(btn, "text-admin-gray-400")}>…</span>
        ) : (
          <button
            key={n}
            type="button"
            aria-current={n === page ? "page" : undefined}
            onClick={() => onPage(n)}
            className={cn(btn, n === page ? "relative z-10 border-[#0d6efd] bg-[#0d6efd] text-white" : "text-[#0d6efd] hover:bg-admin-gray-50")}
          >
            {n}
          </button>
        )
      )}
      <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)} className={cn(btn, "gap-1 text-admin-gray-700 hover:bg-admin-gray-50 disabled:cursor-not-allowed disabled:text-admin-gray-300 disabled:hover:bg-transparent")}>
        Next <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </nav>
  );
}

/**
 * Invoice button. When due payments were collected on this sale there are
 * receipts too: the button shows ×N (invoice + receipts) and opens a small
 * menu. The menu is portalled to <body> with fixed coordinates so the table's
 * horizontal scroll container can't clip it.
 */
function InvoiceCell({ row }: { row: LedgerRow }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const invoiceHref = `/admin/ecommerce/invoice/${row.id}`;
  const iconBtn = "flex h-7 items-center gap-1 rounded-md bg-admin-gray-600 px-1.5 text-white transition-colors hover:bg-admin-gray-800";

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (row.receipts.length === 0) {
    return (
      <a href={invoiceHref} target="_blank" rel="noreferrer" className={cn(iconBtn, "w-7 justify-center px-0")} title="View invoice" aria-label={`Invoice for ${row.orderNumber}`}>
        <FileText className="h-3.5 w-3.5" />
      </a>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          const r = btnRef.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-label={`Invoice and ${row.receipts.length} receipt(s) for ${row.orderNumber}`}
        className={iconBtn}
      >
        <FileText className="h-3.5 w-3.5" />
        <span className="text-[11px] font-semibold">×{row.receipts.length + 1}</span>
      </button>
      {open && pos &&
        createPortal(
          <div ref={menuRef} className="fixed z-[400] w-[240px] rounded-lg border border-admin-gray-200 bg-white py-1 text-[13px] shadow-lg" style={{ top: pos.top, right: pos.right }}>
            <a href={invoiceHref} target="_blank" rel="noreferrer" className="flex items-center justify-between px-3 py-2 hover:bg-admin-gray-50">
              <span className="flex items-center gap-2 text-admin-gray-900"><FileText className="h-3.5 w-3.5 text-admin-gray-500" /> Invoice</span>
              <span className="text-admin-gray-500">{money(row.total)}</span>
            </a>
            <div className="mx-3 my-1 border-t border-admin-gray-100" />
            <div className="px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase text-admin-gray-400">Due payment receipts</div>
            {row.receipts.map((rc) => (
              <a
                key={rc.receiptNumber}
                href={`/admin/ecommerce/payment-receipt/${encodeURIComponent(rc.receiptNumber)}?return_to=${encodeURIComponent(PAGE_PATH)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between px-3 py-2 hover:bg-admin-gray-50"
              >
                <span className="truncate text-admin-gray-900">{rc.receiptNumber}</span>
                <span className="text-emerald-600">{money(rc.amount)}</span>
              </a>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
