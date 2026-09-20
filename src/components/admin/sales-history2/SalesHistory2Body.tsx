"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  TrendingUp, BarChart3, CalendarDays, CalendarRange, ArrowRight, IndianRupee, ShoppingCart, Wallet,
  ArrowUp, ArrowDown, Filter, Search, ChevronDown, RotateCcw, FileText, Globe, ChevronsUpDown, Loader2,
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

  return (
    // Invisible (space kept) until saved Display Options are read, so hidden
    // cards don't flash in and jump away on every open/refresh.
    <div className={cn("space-y-5", !loaded && "invisible")}>
      {(showChart || showMetrics) && (
        <div className={cn("grid grid-cols-1 gap-5", showChart && showMetrics && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.07fr)]")}>
          {showChart && <SalesPerformanceCard chart={chart} />}
          {showMetrics && <KeyMetricsCard metrics={metrics} filters={filters} isDefaultRange={isDefaultRange} />}
        </div>
      )}
      {isVisible("sh2-filters") && <FilterSalesCard filters={filters} options={options} />}
      {isVisible("sh2-ledger") && <SalesLedgerCard rows={rows} />}
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
      <div className="flex min-h-[190px] flex-1 gap-3">
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
      node: <MetricTile icon={IndianRupee} tone="green" label={`Total Sales (${isDefaultRange ? "This Month" : "Selected Range"})`} metric={metrics.rangeTotal} emptyText="No sales in this range" />,
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 min-[1700px]:grid-cols-3">
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
    <div className="flex h-full gap-3.5 rounded-xl border border-admin-gray-100 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white", TONES[tone].bg)}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] text-admin-gray-700" title={label}>{label}</div>
        <div className={cn("mt-1 text-xl font-bold tracking-tight", TONES[tone].text)}>{value}</div>
        <div className="mt-1.5 text-xs">{children}</div>
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
      <span className={cn("flex items-center gap-1", up ? "text-emerald-600" : "text-red-500")}>
        {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {Math.abs(metric.change)}% {metric.compareLabel}
      </span>
    );
  } else {
    sub = <span className="text-admin-gray-500">— {metric.value > 0 ? `Nothing to compare ${metric.compareLabel.replace("vs. ", "with ")}` : emptyText}</span>;
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

function FilterSalesCard({ filters, options }: { filters: SalesFilters; options: FilterOptions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [status, setStatus] = useState<string>(filters.status);
  const [payment, setPayment] = useState<string>(filters.payment);
  const [customer, setCustomer] = useState(filters.customer);
  const [product, setProduct] = useState(filters.product);
  const [q, setQ] = useState(filters.q);

  function apply(e?: React.FormEvent) {
    e?.preventDefault();
    const [a, b] = from <= to ? [from, to] : [to, from];
    const p = new URLSearchParams({ from: a, to: b });
    if (status !== "all") p.set("status", status);
    if (payment !== "all") p.set("payment", payment);
    if (customer) p.set("customer", customer);
    if (product) p.set("product", product);
    if (q.trim()) p.set("q", q.trim());
    startTransition(() => router.push(`${PAGE_PATH}?${p.toString()}`));
  }

  function clear() {
    startTransition(() => router.push(PAGE_PATH));
  }

  // Filters reset to the URL's values after Clear / back-forward navigation.
  useEffect(() => {
    setFrom(filters.from); setTo(filters.to); setStatus(filters.status); setPayment(filters.payment);
    setCustomer(filters.customer); setProduct(filters.product); setQ(filters.q);
  }, [filters]);

  return (
    <Card className="p-5">
      <form onSubmit={apply}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-base font-semibold text-admin-gray-900">
            <Filter className="h-5 w-5 text-blue-600" /> Filter Sales
          </h2>
          <div className="relative w-full sm:w-[400px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by order ID, customer, or item..."
              aria-label="Search sales"
              className="h-9 w-full rounded-lg border border-admin-gray-200 bg-white pl-9 pr-3 text-[13px] placeholder:text-admin-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[1.25fr_1fr_1fr_1fr_1fr_auto]">
          <Field label="Date Range">
            <DateRangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
          </Field>
          <Field label="Order Status">
            <SelectBox value={status} onChange={setStatus} ariaLabel="Order Status">
              <option value="all">All</option>
              <option value="Delivered">Delivered</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Canceled">Canceled</option>
            </SelectBox>
          </Field>
          <Field label="Payment Status">
            <SelectBox value={payment} onChange={setPayment} ariaLabel="Payment Status">
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="due">Due</option>
              <option value="due_cleared">Due Cleared</option>
            </SelectBox>
          </Field>
          <Field label="Customer">
            <SelectBox value={customer} onChange={setCustomer} ariaLabel="Customer">
              <option value="">All Customers</option>
              <option value="guest">Walk-in / Guest</option>
              {options.customers.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
              ))}
            </SelectBox>
          </Field>
          <Field label="Items / Product">
            <SelectBox value={product} onChange={setProduct} ariaLabel="Items / Product">
              <option value="">All Products</option>
              {options.products.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </SelectBox>
          </Field>
          <div className="flex gap-3 sm:col-span-2 lg:col-span-1">
            <button
              type="submit"
              disabled={pending}
              className="flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-70 2xl:flex-none"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />} Apply Filters
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={pending}
              className="flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-admin-gray-200 bg-white px-4 text-sm font-medium text-admin-gray-700 transition-colors hover:bg-admin-gray-50 disabled:opacity-70 2xl:flex-none"
            >
              <RotateCcw className="h-4 w-4" /> Clear
            </button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[13px] font-medium text-admin-gray-700">{label}</div>
      {children}
    </div>
  );
}

function SelectBox({ value, onChange, ariaLabel, children }: { value: string; onChange: (v: string) => void; ariaLabel: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="h-10 w-full appearance-none truncate rounded-lg border border-admin-gray-200 bg-white pl-3 pr-9 text-[13px] text-admin-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-500" />
    </div>
  );
}

function DateRangePicker({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const today = istTodayYmd();
  const presets: { label: string; range: [string, string] }[] = [
    { label: "Today", range: [today, today] },
    { label: "Yesterday", range: [shiftYmd(today, -1), shiftYmd(today, -1)] },
    { label: "Last 7 Days", range: [shiftYmd(today, -6), today] },
    { label: "This Month", range: [`${today.slice(0, 8)}01`, today] },
    (() => {
      const firstThis = `${today.slice(0, 8)}01`;
      const lastPrev = shiftYmd(firstThis, -1);
      return { label: "Last Month", range: [`${lastPrev.slice(0, 8)}01`, lastPrev] as [string, string] };
    })(),
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Date range"
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-admin-gray-200 bg-white px-3 text-left text-[13px] text-admin-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-admin-gray-500" />
        <span className="min-w-0 flex-1 truncate">{dmy(from)} – {dmy(to)}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-admin-gray-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[300px] rounded-xl border border-admin-gray-200 bg-white p-4 shadow-lg">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {presets.map((p) => {
              const active = p.range[0] === from && p.range[1] === to;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onChange(p.range[0], p.range[1])}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    active ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-admin-gray-200 text-admin-gray-600 hover:bg-admin-gray-50"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-admin-gray-600">
              From
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && onChange(e.target.value, to)} className="mt-1 h-9 w-full rounded-md border border-admin-gray-200 px-2 text-[13px] text-admin-gray-900" />
            </label>
            <label className="text-xs text-admin-gray-600">
              To
              <input type="date" value={to} min={from} onChange={(e) => e.target.value && onChange(from, e.target.value)} className="mt-1 h-9 w-full rounded-md border border-admin-gray-200 px-2 text-[13px] text-admin-gray-900" />
            </label>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="mt-3 h-8 w-full rounded-md bg-admin-gray-100 text-xs font-medium text-admin-gray-700 hover:bg-admin-gray-200">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Sales Ledger ───────────────────────── */

type SortKey = "time" | "order" | "customer" | "items" | "payment" | "total" | "paid";

const COLUMNS: { key: string; sort: SortKey | null; label: string; className?: string }[] = [
  { key: "sh2-c-time", sort: "time", label: "Time" },
  { key: "sh2-c-order", sort: "order", label: "Order ID" },
  { key: "sh2-c-customer", sort: "customer", label: "Customer" },
  { key: "sh2-c-items", sort: "items", label: "Items" },
  { key: "sh2-c-payment", sort: "payment", label: "Payment" },
  { key: "sh2-c-total", sort: "total", label: "Total" },
  { key: "sh2-c-paid", sort: "paid", label: "Paid" },
  { key: "sh2-c-invoice", sort: null, label: "Invoice" },
];

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

function SalesLedgerCard({ rows }: { rows: LedgerRow[] }) {
  const { isVisible } = useDashboardWidgetPrefs();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "time", dir: "desc" });
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

  function toggleSort(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "time" || k === "total" || k === "paid" ? "desc" : "asc" }));
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-semibold text-admin-gray-900">
          <FileText className="h-5 w-5 text-blue-600" /> Sales Ledger
        </h2>
        <label className="flex items-center gap-2 text-[13px] text-admin-gray-700">
          Search:
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search the ledger"
            className="h-8 w-[200px] rounded-md border border-admin-gray-200 bg-white px-2.5 text-[13px] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
          />
        </label>
      </div>

      {cols.length === 0 ? (
        <p className="py-10 text-center text-sm text-admin-gray-400">All ledger columns are hidden — turn them on from Display Options.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-admin-gray-200">
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
                shown.map((r) => (
                  <tr key={r.id} className="border-b border-admin-gray-100 odd:bg-white even:bg-admin-gray-50/70 hover:bg-emerald-50/40">
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
                        <div className="max-w-[200px] truncate">
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
                        <div className="max-w-[260px] truncate" title={r.itemsSummary}>{r.itemsSummary}</div>
                      </td>
                    )}
                    {show("sh2-c-payment") && <td className="whitespace-nowrap px-3 py-2 text-admin-gray-800">{r.paymentMethod}</td>}
                    {show("sh2-c-total") && <td className="whitespace-nowrap px-3 py-2 text-admin-gray-900">{money(r.total)}</td>}
                    {show("sh2-c-paid") && (
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="text-admin-gray-900">{money(r.paid)}</div>
                        {r.due > 0.004 && (
                          <Link href="/admin/ecommerce/due" className="text-xs font-semibold text-red-600 underline underline-offset-2 hover:text-red-700">
                            Due {money(r.due)}
                          </Link>
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-admin-gray-500">
        <span>
          Showing {shown.length} of {rows.length} sale{rows.length === 1 ? "" : "s"}
        </span>
        <span>
          Total <b className="text-admin-gray-900">{money(shownTotal)}</b>
          {shownDue > 0.004 && <> · Due <b className="text-red-600">{money(shownDue)}</b></>}
        </span>
      </div>
    </Card>
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
