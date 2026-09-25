"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle, BarChart3, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Clock3, FileSpreadsheet, FileText, Filter, Globe2, History,
  IndianRupee, Loader2, PackagePlus, Printer, ShoppingBag, Store, Tag, Truck, UserRound, Users, Wallet, WalletCards,
} from "lucide-react";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MONTHS, type ReportData, type ReportChannel } from "@/lib/report-types";

// ── small helpers ────────────────────────────────────────────────────────
const TZ = "Asia/Kolkata";
const fDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
const fTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).toUpperCase();
const fDay = (ymd: string) => new Date(`${ymd}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const money = (n: number) => formatMoney(n);
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "0%");
const imgSrc = (s: string | null) => (!s ? null : /^(https?:|\/|data:|blob:)/.test(s) ? s : `/${s}`);
const minutes = (m: number | null) => (m === null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} m`);

const PAY_COLORS: Record<string, string> = { Cash: "#22c55e", UPI: "#7c3aed", Card: "#3b82f6", Online: "#06b6d4", Other: "#94a3b8", "Collected later": "#f59e0b", Due: "#ef4444" };
const ACTION_LABEL: Record<string, string> = {
  ecom_pos_sale: "Store sale", ecom_product_create: "Product added", ecom_product_update: "Product edited", ecom_product_stock_update: "Stock updated",
  login_success: "Logged in", logout: "Logged out", ecom_customer_create: "Customer added", ecom_customer_update: "Customer edited",
};
const actionLabel = (a: string) => ACTION_LABEL[a] ?? a.replace(/^ecom_/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// ── table ────────────────────────────────────────────────────────────────
interface Col<T> { key: string; label: string; right?: boolean; cell: (r: T) => React.ReactNode; foot?: React.ReactNode }

function Table<T>({ cols, rows, rowKey, empty, foot, dense }: { cols: Col<T>[]; rows: T[]; rowKey: (r: T, i: number) => string; empty: string; foot?: boolean; dense?: boolean }) {
  if (!cols.length) return <p className="py-4 text-center text-[13px] text-[#9ca3af]">Every column is hidden — turn some on in Display Options.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px] print:min-w-0 print:text-[10px]">
        <thead>
          <tr className="bg-[#f8f9fb]">
            {cols.map((c) => <th key={c.key} className={cn("whitespace-nowrap border-b border-[#e6e8ef] px-3 py-2.5 text-[12px] font-semibold text-[#374151] print:px-1.5 print:py-1.5 print:text-[9.5px]", c.right ? "text-right" : "text-left")}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-[#9ca3af]">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="border-b border-[#eef0f4] last:border-0 hover:bg-[#fafaff] print:break-inside-avoid">
              {cols.map((c) => <td key={c.key} className={cn("px-3 align-middle text-[#1f2937] print:px-1.5 print:py-1", dense ? "py-2" : "py-2.5", c.right && "text-right tabular-nums")}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && rows.length > 0 && (
          <tfoot><tr className="bg-[#f8f9fb] font-semibold">{cols.map((c) => <td key={c.key} className={cn("border-t border-[#e6e8ef] px-3 py-2.5 print:px-1.5 print:py-1.5", c.right && "text-right tabular-nums")}>{c.foot ?? ""}</td>)}</tr></tfoot>
        )}
      </table>
    </div>
  );
}

function Pager({ page, pages, total, size, setPage, setSize }: { page: number; pages: number; total: number; size: number; setPage: (n: number) => void; setSize: (n: number) => void }) {
  const from = total === 0 ? 0 : (page - 1) * size + 1, to = Math.min(total, page * size);
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== "…") nums.push("…");
  const btn = "grid h-9 min-w-9 place-items-center rounded-[8px] border border-[#e5e7eb] bg-white px-2 text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] disabled:opacity-40";
  return (
    <div className="rb-noprint mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#4b5563]">
      <span className="flex items-center gap-2">Showing {from} to {to} of {total} entries
        <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }} aria-label="Rows per page" className="h-8 rounded-[8px] border border-[#e5e7eb] bg-white pl-2 pr-7 text-[12px]">
          {[8, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </span>
      {pages > 1 && (
        <span className="flex items-center gap-1.5">
          <button type="button" className={btn} disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
          {nums.map((n, i) => n === "…" ? <span key={`e${i}`} className="px-1 text-[#9ca3af]">…</span>
            : <button key={n} type="button" onClick={() => setPage(n)} className={cn(btn, n === page && "border-[#7c3aed] bg-[#7c3aed] text-white hover:bg-[#6d28d9]")}>{n}</button>)}
          <button type="button" className={btn} disabled={page === pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
        </span>
      )}
    </div>
  );
}

function SectionTitle({ icon: Icon, children, extra }: { icon: typeof History; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between gap-3 first:mt-0 print:mb-1.5 print:mt-4">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#6d28d9] print:text-[12px]"><Icon className="h-[18px] w-[18px]" />{children}</h3>
      {extra}
    </div>
  );
}

/** A table that shows its first rows with a "Show all" switch (everything when printing). */
function Section<T>({ show, all, icon, title, cols, rows, rowKey, empty, foot }: { show: boolean; all: boolean; icon: typeof History; title: string; cols: Col<T>[]; rows: T[]; rowKey: (r: T, i: number) => string; empty: string; foot?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!show) return null;
  const list = all || open ? rows : rows.slice(0, 10);
  return (
    <section className="print:break-inside-auto">
      <SectionTitle icon={icon} extra={<span className="text-[12px] text-[#6b7280]">{rows.length} {rows.length === 1 ? "entry" : "entries"}</span>}>{title}</SectionTitle>
      <div className="rounded-[10px] border border-[#eef0f4] print:rounded-none">
        <Table cols={cols} rows={list} rowKey={rowKey} empty={empty} foot={foot} dense />
      </div>
      {!all && rows.length > 10 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="rb-noprint mt-2 text-[13px] font-semibold text-[#7c3aed] hover:underline">{open ? "Show less" : `Show all ${rows.length}`}</button>
      )}
    </section>
  );
}

// ── the report sheet (screen + print/PDF) ─────────────────────────────────
function Sheet({ data, all }: { data: ReportData; all: boolean }) {
  const { isVisible } = useDashboardWidgetPrefs();
  const on = (g: string, k: string) => isVisible(g) && isVisible(k);
  const { business: b, kpis: k, selectedUser: su } = data;
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(8);
  useEffect(() => setPage(1), [data]);

  const tlCols = ([
    { key: "rb-c-time", label: "Time", cell: (r) => <span className="whitespace-nowrap">{fDate(r.at)}<br /><span className="text-[#6b7280]">{fTime(r.at)}</span></span> },
    { key: "rb-c-order", label: "Order ID", cell: (r) => <Link href={`/admin/ecommerce/orders/${r.orderId}`} className="font-medium text-[#6d28d9] hover:underline">{r.orderNumber}</Link> },
    { key: "rb-c-channel", label: "Channel", cell: (r) => <span className={cn("rounded-[6px] px-2 py-0.5 text-[12px] font-medium", r.channel === "online" ? "bg-[#e8f8ee] text-[#15803d]" : "bg-[#eaf1ff] text-[#1d4ed8]")}>{r.channel === "online" ? "Online" : "In-store"}</span> },
    { key: "rb-c-customer", label: "Customer", cell: (r) => <span><span className="block">{r.customer}</span>{isVisible("rb-c-phone") && <span className="text-[12px] text-[#6b7280]">{r.phone ?? "—"}</span>}</span> },
    { key: "rb-c-product", label: "Product", cell: (r) => <span className="font-medium">{r.product}</span> },
    { key: "rb-c-sku", label: "SKU", cell: (r) => r.sku ?? "—" },
    { key: "rb-c-category", label: "Category", cell: (r) => r.category ?? "—" },
    { key: "rb-c-qty", label: "Qty", right: true, cell: (r) => r.qty, foot: k.units },
    { key: "rb-c-price", label: "Unit Price", right: true, cell: (r) => money(r.unitPrice) },
    { key: "rb-c-total", label: "Total", right: true, cell: (r) => money(r.total), foot: money(data.timeline.reduce((s, r) => s + r.total, 0)) },
    { key: "rb-c-gst", label: "GST", right: true, cell: (r) => money(r.gst) },
    { key: "rb-c-payment", label: "Payment", cell: (r) => r.payment },
    { key: "rb-c-due", label: "Due", right: true, cell: (r) => (r.due === null ? <span className="text-[#c0c4cc]">—</span> : <span className={r.due > 0 ? "font-semibold text-[#dc2626]" : ""}>{money(r.due)}</span>), foot: money(k.due) },
    { key: "rb-c-status", label: "Status", cell: (r) => r.status },
    { key: "rb-c-staff", label: "Sold / delivered by", cell: (r) => r.staff ?? "—" },
  ] as Col<ReportData["timeline"][number]>[]).filter((c) => c.key === "rb-c-customer" ? isVisible("rb-c-customer") : isVisible(c.key));
  const pages = Math.max(1, Math.ceil(data.timeline.length / size));
  const tlRows = all ? data.timeline : data.timeline.slice((page - 1) * size, page * size);

  const kpis = [
    { key: "rb-k-sales", icon: IndianRupee, tone: "bg-[#f1ebff] text-[#7c3aed]", label: "Total Sales", value: money(k.sales), sub: `${k.orders} Orders` },
    { key: "rb-k-units", icon: ShoppingBag, tone: "bg-[#e8f0ff] text-[#2563eb]", label: "Total Products Sold", value: String(k.units), sub: "Units" },
    { key: "rb-k-due", icon: AlertTriangle, tone: "bg-[#fdecec] text-[#dc2626]", label: "Total Dues", value: money(k.due), sub: `${k.dueOrders} Orders` },
    { key: "rb-k-collected", icon: WalletCards, tone: "bg-[#e7f7ee] text-[#16a34a]", label: "Due Collected", value: money(k.collected), sub: `${k.collections} Payments` },
  ].filter((x) => on("rb-kpi", x.key));
  const extras = [
    { key: "rb-k-added", icon: PackagePlus, label: "Products Added", value: String(k.productsAdded) },
    { key: "rb-k-newdue", icon: Wallet, label: "New Dues", value: `${money(k.newDues)} · ${k.newDueCount}` },
    { key: "rb-k-avg", icon: BarChart3, label: "Average Order", value: money(k.avgOrder) },
    { key: "rb-k-discount", icon: Tag, label: "Discount Given", value: money(k.discount) },
    { key: "rb-k-gst", icon: FileText, label: "GST Collected", value: money(k.gst) },
    { key: "rb-k-online", icon: Globe2, label: "Online Orders Placed", value: `${k.onlinePlaced}${k.canceled ? ` · ${k.canceled} canceled` : ""}` },
  ].filter((x) => on("rb-kpi", x.key));
  const logo = imgSrc(b.logo);
  const title = su ? "Staff Report" : data.filters.channel === "offline" ? "In-store Sales Report" : data.filters.channel === "online" ? "Online Sales Report" : "Sales Report";
  const staffRow = su ? data.staff.find((s) => s.userId === su.id) : null;
  const agentRow = su ? data.agents.find((a) => a.userId === su.id) : null;

  return (
    <div className="rounded-[12px] border border-[#e5e7eb] bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {/* Header: logo · business · report */}
      {isVisible("rb-head") && (
        <header className="flex flex-wrap items-start gap-x-6 gap-y-4 border-b border-dashed border-[#d9dce3] pb-6 print:pb-3">
          {(on("rb-head", "rb-h-logo") || on("rb-head", "rb-h-name")) && (
            <div className="flex min-w-0 items-center gap-3 pr-6 sm:border-r sm:border-[#e5e7eb]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {on("rb-head", "rb-h-logo") && logo && <img src={logo} alt="" className="h-14 w-auto max-w-[140px] object-contain print:h-12" />}
              {on("rb-head", "rb-h-name") && (
                <div className="min-w-0">
                  <p className="text-[22px] font-bold leading-tight text-[#6d28d9] print:text-[18px]">{b.name}</p>
                  {b.tagline && <p className="text-[13px] text-[#4b5563]">{b.tagline}</p>}
                </div>
              )}
            </div>
          )}
          <div className="min-w-[200px] flex-1 text-[13.5px] leading-6 text-[#374151] print:text-[11px] print:leading-5">
            <p className="text-[17px] font-semibold text-[#111827] print:text-[14px]">{b.name}</p>
            {on("rb-head", "rb-h-address") && b.address && <p className="whitespace-pre-line">{b.address}</p>}
            {on("rb-head", "rb-h-contact") && (b.phones.length > 0 || b.email) && <p>{b.phones.length > 0 && <>Mobile: {b.phones.join(", ")}</>}{b.phones.length > 0 && b.email && " · "}{b.email}</p>}
            {on("rb-head", "rb-h-gstin") && b.gstin && <p>GSTIN: {b.gstin}</p>}
          </div>
          <div className="ml-auto text-right">
            <p className="text-[22px] font-bold text-[#111827] print:text-[17px]">{title}</p>
            <p className="text-[16px] text-[#374151] print:text-[12px]">{data.rangeLabel}</p>
            {su && <p className="text-[13px] font-medium text-[#6d28d9]">{su.name} · {su.role}</p>}
            {on("rb-head", "rb-h-generated") && <p className="mt-0.5 text-[13px] text-[#6b7280] print:text-[10px]">Generated on {fDate(data.generatedAt)} {fTime(data.generatedAt)}</p>}
          </div>
        </header>
      )}

      {/* One staff member */}
      {su && (
        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-[10px] bg-[#f7f5ff] p-4 print:mt-3 print:p-2">
          {imgSrc(su.avatar)
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={imgSrc(su.avatar)!} alt="" className="h-12 w-12 rounded-full object-cover" />
            : <span className="grid h-12 w-12 place-items-center rounded-full bg-[#7c3aed] text-lg font-bold text-white">{su.name.charAt(0).toUpperCase()}</span>}
          <div className="min-w-[160px] flex-1">
            <p className="font-semibold text-[#111827]">{su.name} <span className="ml-1 rounded-[6px] bg-white px-2 py-0.5 text-[12px] font-medium text-[#6d28d9]">{su.role}</span></p>
            <p className="text-[12.5px] text-[#6b7280]">{[su.phone, su.email].filter(Boolean).join(" · ")} · Staff since {fDate(su.since)}</p>
          </div>
          {[
            ["Store sales", `${staffRow?.posSales ?? 0} · ${money(staffRow?.posAmount ?? 0)}`],
            ["Dues collected", `${staffRow?.collections ?? 0} · ${money(staffRow?.collectedAmount ?? 0)}`],
            ["Delivered", `${agentRow?.delivered ?? 0}${agentRow?.pending ? ` · ${agentRow.pending} pending` : ""}`],
            ["Products added", String(staffRow?.productsAdded ?? 0)],
            ["Actions", String(data.activity.length)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-[8px] bg-white px-3 py-2 text-center"><p className="text-[11.5px] text-[#6b7280]">{l}</p><p className="text-[14px] font-semibold text-[#111827]">{v}</p></div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      {kpis.length > 0 && (
        <div className={cn("mt-5 grid grid-cols-2 gap-y-4 border-b border-[#eef0f4] pb-5 print:mt-3 print:grid-cols-4 print:pb-3", kpis.length >= 4 ? "lg:grid-cols-4" : kpis.length === 3 ? "lg:grid-cols-3" : "")}>
          {kpis.map((x, i) => (
            <div key={x.key} className={cn("flex items-center gap-3.5 px-4 print:gap-2 print:px-2", i > 0 && "lg:border-l lg:border-[#e5e7eb] print:border-l print:border-[#e5e7eb]")}>
              <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-full print:h-9 print:w-9", x.tone)}><x.icon className="h-6 w-6 print:h-4 print:w-4" /></span>
              <span className="min-w-0">
                <span className="block text-[13px] text-[#4b5563] print:text-[10px]">{x.label}</span>
                <span className="block truncate text-[22px] font-bold leading-tight text-[#111827] print:text-[15px]">{x.value}</span>
                <span className="block text-[12.5px] text-[#6b7280] print:text-[9.5px]">{x.sub}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {extras.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 print:mt-2">
          {extras.map((x) => (
            <span key={x.key} className="inline-flex items-center gap-2 rounded-[8px] border border-[#eef0f4] bg-[#fafafc] px-3 py-1.5 text-[12.5px] print:px-2 print:py-1 print:text-[10px]">
              <x.icon className="h-3.5 w-3.5 text-[#7c3aed]" /><span className="text-[#6b7280]">{x.label}</span><b className="font-semibold text-[#111827]">{x.value}</b>
            </span>
          ))}
        </div>
      )}

      {/* Summaries from the right panel, printed inside the report */}
      {all && <PrintSummaries data={data} />}

      {/* Product-wise Sales Timeline */}
      {isVisible("rb-tl") && (
        <section>
          <SectionTitle icon={ClipboardList}>Product-wise Sales Timeline</SectionTitle>
          <div className="rounded-[10px] border border-[#eef0f4] print:rounded-none">
            <Table cols={tlCols} rows={tlRows} rowKey={(r) => r.key} empty="No sales in this period." foot={all} />
          </div>
          {!all && <Pager page={Math.min(page, pages)} pages={pages} total={data.timeline.length} size={size} setPage={setPage} setSize={setSize} />}
        </section>
      )}

      <Section show={isVisible("rb-g-products")} all={all} icon={ShoppingBag} title="Product Summary" rows={data.products} rowKey={(r) => String(r.productId)} empty="No products sold." foot
        cols={([
          { key: "rb-p-name", label: "Product", cell: (r) => <span className="font-medium">{r.name}</span>, foot: "Total" },
          { key: "rb-p-sku", label: "SKU", cell: (r) => r.sku ?? "—" },
          { key: "rb-p-category", label: "Category", cell: (r) => r.category ?? "—" },
          { key: "rb-p-orders", label: "Orders", right: true, cell: (r) => r.orders },
          { key: "rb-p-qty", label: "Qty sold", right: true, cell: (r) => r.qty, foot: k.units },
          { key: "rb-p-revenue", label: "Revenue", right: true, cell: (r) => money(r.revenue), foot: money(data.products.reduce((s, r) => s + r.revenue, 0)) },
          { key: "rb-p-last", label: "Last sold", cell: (r) => `${fDate(r.lastSoldAt)}, ${fTime(r.lastSoldAt)}` },
        ] as Col<ReportData["products"][number]>[]).filter((c) => isVisible(c.key))} />

      <Section show={isVisible("rb-g-daily") && data.daily.length > 1} all={all} icon={CalendarDays} title="Day-wise Summary" rows={data.daily} rowKey={(r) => r.day} empty="—" foot
        cols={([
          { key: "rb-d-day", label: "Date", cell: (r) => fDay(r.day), foot: "Total" },
          { key: "rb-d-orders", label: "Orders", right: true, cell: (r) => r.orders, foot: k.orders },
          { key: "rb-d-offline", label: "In-store", right: true, cell: (r) => r.offline, foot: data.channels.offline.orders },
          { key: "rb-d-online", label: "Online", right: true, cell: (r) => r.online, foot: data.channels.online.orders },
          { key: "rb-d-units", label: "Units", right: true, cell: (r) => r.units, foot: k.units },
          { key: "rb-d-sales", label: "Sales", right: true, cell: (r) => money(r.sales), foot: money(k.sales) },
          { key: "rb-d-due", label: "Due", right: true, cell: (r) => money(r.due), foot: money(k.due) },
          { key: "rb-d-collected", label: "Collected", right: true, cell: (r) => money(r.collected), foot: money(k.collected) },
        ] as Col<ReportData["daily"][number]>[]).filter((c) => isVisible(c.key))} />

      <Section show={isVisible("rb-g-collections")} all={all} icon={WalletCards} title="Due Collections" rows={data.collections} rowKey={(r) => r.key} empty="No due payments collected in this period." foot
        cols={([
          { key: "rb-col-time", label: "Time", cell: (r) => `${fDate(r.at)}, ${fTime(r.at)}`, foot: "Total" },
          { key: "rb-col-receipt", label: "Receipt", cell: (r) => r.receipt },
          { key: "rb-col-customer", label: "Customer", cell: (r) => r.customer },
          { key: "rb-col-order", label: "Order", cell: (r) => (r.orderId ? <Link href={`/admin/ecommerce/orders/${r.orderId}`} className="text-[#6d28d9] hover:underline">{r.orderNumber}</Link> : "—") },
          { key: "rb-col-method", label: "Method", cell: (r) => r.method },
          { key: "rb-col-amount", label: "Amount", right: true, cell: (r) => money(r.amount), foot: money(k.collected) },
          { key: "rb-col-by", label: "Received by", cell: (r) => r.by ?? "—" },
        ] as Col<ReportData["collections"][number]>[]).filter((c) => isVisible(c.key))} />

      <Section show={isVisible("rb-g-dues")} all={all} icon={AlertTriangle} title="New Dues" rows={data.newDues} rowKey={(r) => r.key} empty="No new dues in this period." foot
        cols={([
          { key: "rb-du-time", label: "Time", cell: (r) => `${fDate(r.at)}, ${fTime(r.at)}`, foot: "Total" },
          { key: "rb-du-order", label: "Order", cell: (r) => <Link href={`/admin/ecommerce/orders/${r.orderId}`} className="text-[#6d28d9] hover:underline">{r.orderNumber}</Link> },
          { key: "rb-du-customer", label: "Customer", cell: (r) => r.customer },
          { key: "rb-du-phone", label: "Mobile", cell: (r) => r.phone ?? "—" },
          { key: "rb-du-amount", label: "Due amount", right: true, cell: (r) => money(r.amount), foot: money(k.newDues) },
          { key: "rb-du-paid", label: "Paid since", right: true, cell: (r) => money(r.paid), foot: money(data.newDues.reduce((s, r) => s + r.paid, 0)) },
          { key: "rb-du-balance", label: "Balance", right: true, cell: (r) => <span className={r.balance > 0 ? "font-semibold text-[#dc2626]" : "text-[#16a34a]"}>{money(r.balance)}</span>, foot: money(data.newDues.reduce((s, r) => s + r.balance, 0)) },
          { key: "rb-du-promised", label: "Promised", cell: (r) => (r.promised ? fDate(r.promised) : "—") },
          { key: "rb-du-status", label: "Status", cell: (r) => <span className="capitalize">{r.status}</span> },
        ] as Col<ReportData["newDues"][number]>[]).filter((c) => isVisible(c.key))} />

      <Section show={isVisible("rb-g-added")} all={all} icon={PackagePlus} title="Products Added" rows={data.added} rowKey={(r) => String(r.id)} empty="No products added in this period."
        cols={([
          { key: "rb-a-time", label: "Time", cell: (r) => `${fDate(r.at)}, ${fTime(r.at)}` },
          { key: "rb-a-name", label: "Product", cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "rb-a-sku", label: "SKU", cell: (r) => r.sku ?? "—" },
          { key: "rb-a-category", label: "Category", cell: (r) => r.category ?? "—" },
          { key: "rb-a-price", label: "Price", right: true, cell: (r) => money(r.price) },
          { key: "rb-a-stock", label: "Stock", right: true, cell: (r) => r.stock ?? "—" },
          { key: "rb-a-by", label: "Added by", cell: (r) => r.by ?? "—" },
        ] as Col<ReportData["added"][number]>[]).filter((c) => isVisible(c.key))} />

      <Section show={isVisible("rb-g-agents") && (data.agents.length > 0 || data.filters.channel !== "offline")} all={all} icon={Truck} title="Deliveries by Agent" rows={data.agents} rowKey={(r) => String(r.userId)} empty="No deliveries assigned in this period." foot
        cols={([
          { key: "rb-ag-name", label: "Agent", cell: (r) => <span className="font-medium">{r.name}</span>, foot: "Total" },
          { key: "rb-ag-assigned", label: "Assigned", right: true, cell: (r) => r.assigned, foot: data.agents.reduce((s, r) => s + r.assigned, 0) },
          { key: "rb-ag-delivered", label: "Delivered", right: true, cell: (r) => <span className="font-semibold text-[#16a34a]">{r.delivered}</span>, foot: data.agents.reduce((s, r) => s + r.delivered, 0) },
          { key: "rb-ag-pending", label: "Pending", right: true, cell: (r) => r.pending, foot: data.agents.reduce((s, r) => s + r.pending, 0) },
          { key: "rb-ag-canceled", label: "Canceled", right: true, cell: (r) => r.canceled, foot: data.agents.reduce((s, r) => s + r.canceled, 0) },
          { key: "rb-ag-value", label: "Delivered value", right: true, cell: (r) => money(r.deliveredValue), foot: money(data.agents.reduce((s, r) => s + r.deliveredValue, 0)) },
          { key: "rb-ag-avg", label: "Avg. time", right: true, cell: (r) => minutes(r.avgMinutes) },
        ] as Col<ReportData["agents"][number]>[]).filter((c) => isVisible(c.key))} />

      <Section show={isVisible("rb-g-staff") && !su} all={all} icon={Users} title="Staff Performance" rows={data.staff} rowKey={(r) => String(r.userId)} empty="No staff activity in this period."
        cols={([
          { key: "rb-st-name", label: "Staff", cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "rb-st-role", label: "Role", cell: (r) => r.role },
          { key: "rb-st-pos", label: "Store sales", right: true, cell: (r) => r.posSales },
          { key: "rb-st-posamt", label: "Sales amount", right: true, cell: (r) => money(r.posAmount) },
          { key: "rb-st-col", label: "Collections", right: true, cell: (r) => r.collections },
          { key: "rb-st-colamt", label: "Collected", right: true, cell: (r) => money(r.collectedAmount) },
          { key: "rb-st-delivered", label: "Delivered", right: true, cell: (r) => r.delivered },
          { key: "rb-st-added", label: "Products added", right: true, cell: (r) => r.productsAdded },
        ] as Col<ReportData["staff"][number]>[]).filter((c) => isVisible(c.key))} />

      <Section show={isVisible("rb-g-activity") && !!su} all={all} icon={History} title={`Everything ${su?.name ?? ""} did`} rows={data.activity} rowKey={(r) => r.key} empty="No activity in this period."
        cols={([
          { key: "rb-ac-time", label: "Time", cell: (r) => `${fDate(r.at)}, ${fTime(r.at)}` },
          { key: "rb-ac-action", label: "Action", cell: (r) => <span className="font-medium">{actionLabel(r.action)}</span> },
          { key: "rb-ac-details", label: "Details", cell: (r) => <span className="text-[#4b5563]">{r.description}</span> },
        ] as Col<ReportData["activity"][number]>[]).filter((c) => isVisible(c.key))} />

      {all && <p className="mt-6 border-t border-[#e5e7eb] pt-2 text-center text-[9.5px] text-[#9ca3af]">{b.name} · {title} · {data.rangeLabel} · Generated {fDate(data.generatedAt)} {fTime(data.generatedAt)}</p>}
    </div>
  );
}

/** Payment / channel / aging tables for the printed report (on screen they live in the right panel). */
function PrintSummaries({ data }: { data: ReportData }) {
  const { isVisible } = useDashboardWidgetPrefs();
  const on = (k: string) => isVisible("rb-side") && isVisible(k);
  const total = data.payments.reduce((s, p) => s + p.amount, 0);
  const box = "rounded-[6px] border border-[#e5e7eb] p-2 text-[10px]";
  const row = "flex justify-between gap-2 py-0.5";
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {on("rb-r-payment") && <div className={box}><p className="mb-1 font-semibold text-[#6d28d9]">Payment Summary</p>{data.payments.map((p) => <p key={p.method} className={row}><span>{p.method}</span><span>{money(p.amount)} ({pct(p.amount, total)})</span></p>)}</div>}
      {on("rb-r-channel") && <div className={box}><p className="mb-1 font-semibold text-[#6d28d9]">Sales Channel</p>
        <p className={row}><span>In-store · {data.channels.offline.orders}</span><span>{money(data.channels.offline.amount)}</span></p>
        <p className={row}><span>Online · {data.channels.online.orders}</span><span>{money(data.channels.online.amount)}</span></p>
        {on("rb-r-online") && data.onlineStatus.filter((s) => s.count).map((s) => <p key={s.status} className={row}><span>Online {s.status}</span><span>{s.count}</span></p>)}
      </div>}
      {on("rb-r-aging") && <div className={box}><p className="mb-1 font-semibold text-[#6d28d9]">Due Aging</p>{data.aging.map((a) => <p key={a.bucket} className={row}><span>{a.bucket} · {a.orders}</span><span>{money(a.amount)}</span></p>)}<p className={cn(row, "border-t border-[#e5e7eb] font-semibold")}><span>Total Dues</span><span>{money(data.kpis.due)}</span></p></div>}
    </div>
  );
}

// ── right panel ─────────────────────────────────────────────────────────
function Card({ icon: Icon, title, children }: { icon: typeof History; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-[#e5e7eb] bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-[#111827]"><Icon className="h-[18px] w-[18px] text-[#7c3aed]" />{title}</h3>
      {children}
    </section>
  );
}

function Donut({ parts, total }: { parts: { method: string; amount: number }[]; total: number }) {
  let acc = 0;
  const stops = total > 0 ? parts.map((p) => { const from = (acc / total) * 360; acc += p.amount; return `${PAY_COLORS[p.method] ?? "#94a3b8"} ${from}deg ${(acc / total) * 360}deg`; }).join(", ") : "#eef0f4 0deg 360deg";
  return (
    <div className="relative h-[150px] w-[150px] shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }}>
      <div className="absolute inset-[18px] grid place-items-center rounded-full bg-white text-center">
        <span><span className="block text-[16px] font-bold text-[#111827]">{money(total)}</span><span className="text-[12px] text-[#6b7280]">Total Sales</span></span>
      </div>
    </div>
  );
}

// ── page ────────────────────────────────────────────────────────────────
export function ReportBuilder({ data }: { data: ReportData }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const { isVisible, loaded } = useDashboardWidgetPrefs();
  const on = (g: string, k: string) => isVisible(g) && isVisible(k);
  const [popup, setPopup] = useState<null | "month" | "custom">(null);
  const [year, setYear] = useState(Number(data.filters.from.slice(0, 4)));
  const [cFrom, setCFrom] = useState(data.filters.from);
  const [cTo, setCTo] = useState(data.filters.to);
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  const f = data.filters;
  const today = useMemo(() => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10), []);

  useEffect(() => { setCFrom(f.from); setCTo(f.to); }, [f.from, f.to]);
  useEffect(() => {
    if (!popup) return;
    const away = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node)) setPopup(null); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [popup]);

  function go(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params?.toString() ?? "");
    for (const [key, v] of Object.entries(next)) { if (v === null || v === "") sp.delete(key); else sp.set(key, v); }
    if (next.range && next.range !== "month") sp.delete("m");
    if (next.range && next.range !== "custom") { sp.delete("from"); sp.delete("to"); }
    setPopup(null);
    start(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  // Print / PDF: the full report (every row) in its own A4 layout.
  useEffect(() => {
    if (!printing) return;
    const prevTitle = document.title;
    document.title = `${data.business.name} - ${data.selectedUser ? `${data.selectedUser.name} - ` : ""}Report ${f.from}${f.to !== f.from ? ` to ${f.to}` : ""}`.replace(/[\\/:*?"<>|]/g, "-");
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 250);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); document.title = prevTitle; };
  }, [printing, data, f.from, f.to]);

  async function exportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const k = data.kpis;
      const add = (name: string, rows: Record<string, unknown>[], widths?: number[]) => {
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: "No data in this period" }]);
        if (widths) ws["!cols"] = widths.map((w) => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
      };
      const summary: (string | number)[][] = [
        [data.business.name], [data.business.address ?? ""], [data.business.phones.join(", ")],
        [], [data.selectedUser ? `Staff Report — ${data.selectedUser.name} (${data.selectedUser.role})` : "Sales Report", data.rangeLabel],
        ["Channel", f.channel === "all" ? "All Sales" : f.channel === "offline" ? "In-store" : "Online"],
        ["Generated on", `${fDate(data.generatedAt)} ${fTime(data.generatedAt)}`], [],
        ["Total Sales", k.sales], ["Orders", k.orders], ["Products Sold (units)", k.units], ["Total Dues", k.due], ["Orders with due", k.dueOrders],
        ["Due Collected", k.collected], ["Due payments", k.collections], ["New Dues", k.newDues], ["Products Added", k.productsAdded],
        ["Average Order", k.avgOrder], ["Discount Given", k.discount], ["GST Collected", k.gst], ["Online Orders Placed", k.onlinePlaced], ["Canceled Online Orders", k.canceled], [],
        ["Payment Summary"], ...data.payments.map((p) => [p.method, p.amount]), [],
        ["Sales Channel"], ["In-store", data.channels.offline.amount, `${data.channels.offline.orders} orders`], ["Online", data.channels.online.amount, `${data.channels.online.orders} orders`], [],
        ["Due Aging"], ...data.aging.map((a) => [a.bucket, a.amount, `${a.orders} orders`]), [],
        ["Online Orders by Status"], ...data.onlineStatus.map((s) => [s.status, s.count]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(summary);
      ws["!cols"] = [{ wch: 26 }, { wch: 18 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, "Summary");
      add("Sales Timeline", data.timeline.map((r) => ({
        Date: fDate(r.at), Time: fTime(r.at), "Order ID": r.orderNumber, Channel: r.channel === "online" ? "Online" : "In-store", Status: r.status,
        Customer: r.customer, Mobile: r.phone ?? "", Product: r.product, SKU: r.sku ?? "", Category: r.category ?? "", Qty: r.qty, "Unit Price": r.unitPrice,
        Total: r.total, GST: r.gst, Payment: r.payment, Due: r.due ?? "", "Sold / delivered by": r.staff ?? "",
      })), [12, 12, 14, 9, 11, 20, 13, 28, 12, 14, 6, 10, 10, 8, 12, 9, 18]);
      add("Product Summary", data.products.map((r) => ({ Product: r.name, SKU: r.sku ?? "", Category: r.category ?? "", Orders: r.orders, "Qty Sold": r.qty, Revenue: r.revenue, "Last Sold": `${fDate(r.lastSoldAt)} ${fTime(r.lastSoldAt)}` })), [30, 12, 16, 8, 9, 12, 22]);
      add("Day-wise", data.daily.map((r) => ({ Date: fDay(r.day), Orders: r.orders, "In-store": r.offline, Online: r.online, Units: r.units, Sales: r.sales, Due: r.due, Collected: r.collected })), [18, 8, 9, 8, 8, 12, 10, 11]);
      add("Due Collections", data.collections.map((r) => ({ Date: fDate(r.at), Time: fTime(r.at), Receipt: r.receipt, Customer: r.customer, Order: r.orderNumber ?? "", Method: r.method, Amount: r.amount, "Received by": r.by ?? "" })), [12, 12, 14, 20, 14, 9, 10, 16]);
      add("New Dues", data.newDues.map((r) => ({ Date: fDate(r.at), Time: fTime(r.at), Order: r.orderNumber, Customer: r.customer, Mobile: r.phone ?? "", "Due Amount": r.amount, "Paid Since": r.paid, Balance: r.balance, Promised: r.promised ? fDate(r.promised) : "", Status: r.status })), [12, 12, 14, 20, 13, 11, 10, 10, 12, 9]);
      add("Products Added", data.added.map((r) => ({ Date: fDate(r.at), Time: fTime(r.at), Product: r.name, SKU: r.sku ?? "", Category: r.category ?? "", Price: r.price, Stock: r.stock ?? "", "Added by": r.by ?? "" })), [12, 12, 28, 12, 16, 9, 7, 16]);
      add("Deliveries", data.agents.map((r) => ({ Agent: r.name, Assigned: r.assigned, Delivered: r.delivered, Pending: r.pending, Canceled: r.canceled, "Delivered Value": r.deliveredValue, "Avg Delivery Time": minutes(r.avgMinutes) })), [18, 9, 9, 8, 9, 14, 16]);
      add("Staff", data.staff.map((r) => ({ Staff: r.name, Role: r.role, "Store Sales": r.posSales, "Sales Amount": r.posAmount, Collections: r.collections, Collected: r.collectedAmount, Delivered: r.delivered, "Products Added": r.productsAdded })), [18, 14, 10, 12, 11, 11, 9, 13]);
      if (data.selectedUser) add("Activity", data.activity.map((r) => ({ Date: fDate(r.at), Time: fTime(r.at), Action: actionLabel(r.action), Details: r.description })), [12, 12, 18, 60]);
      XLSX.writeFile(wb, `${data.business.name.replace(/[^\w-]+/g, "-")}_${data.selectedUser ? `${data.selectedUser.name.replace(/[^\w-]+/g, "-")}_` : ""}Report_${f.from}${f.to !== f.from ? `_to_${f.to}` : ""}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  const chip = (active: boolean) => cn("inline-flex h-10 items-center gap-2 rounded-[8px] border bg-white px-3.5 text-[13.5px] font-medium transition",
    active ? "border-[#7c3aed] bg-[#f7f3ff] text-[#6d28d9] shadow-[0_0_0_1px_#7c3aed_inset]" : "border-[#e5e7eb] text-[#374151] hover:border-[#c4b5fd]");
  const seg = (active: boolean) => cn("inline-flex h-10 items-center gap-2 rounded-[8px] border px-4 text-[13.5px] font-medium transition",
    active ? "border-[#7c3aed] bg-[#7c3aed] text-white shadow-sm" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#c4b5fd]");
  const payTotal = data.payments.reduce((s, p) => s + p.amount, 0);
  const salesTotal = data.channels.offline.amount + data.channels.online.amount;
  const agingTone = ["bg-[#fef2f2] text-[#dc2626]", "bg-[#fff7ed] text-[#ea580c]", "bg-[#fefce8] text-[#ca8a04]", "bg-[#f5f3ff] text-[#6d28d9]"];
  const monthLabel = f.preset === "month" ? `${MONTHS[Number(f.from.slice(5, 7)) - 1]} ${f.from.slice(0, 4)}` : "Month";

  return (
    <div className={cn(!loaded && "invisible")}>
      <style>{`
        @media screen { #rb-print-root { display: none; } }
        @media print {
          @page { size: A4; margin: 10mm; }
          body > *:not(#rb-print-root) { display: none !important; }
          #rb-print-root { display: block; }
          #rb-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .rb-noprint { display: none !important; }
        }
      `}</style>

      {/* Filters */}
      {isVisible("rb-filters") && (
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          {on("rb-filters", "rb-f-presets") && (
            <>
              <span className="mr-1 text-[13.5px] font-semibold text-[#111827]">Date Presets</span>
              {([["today", "Today"], ["yesterday", "Yesterday"], ["this_month", "This Month"], ["prev_month", "Previous Month"]] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => go({ range: v })} className={chip(f.preset === v)}>{l}</button>
              ))}
            </>
          )}
          <div ref={pop} className="relative flex flex-wrap items-center gap-2.5">
            {on("rb-filters", "rb-f-month") && (
              <button type="button" onClick={() => setPopup(popup === "month" ? null : "month")} className={chip(f.preset === "month")} aria-expanded={popup === "month"}>
                <CalendarDays className="h-4 w-4" />{monthLabel}
              </button>
            )}
            {on("rb-filters", "rb-f-range") && (
              <>
                <button type="button" onClick={() => setPopup(popup === "custom" ? null : "custom")} className="inline-flex h-10 min-w-[210px] items-center justify-between gap-3 rounded-[8px] border border-[#e5e7eb] bg-white px-3.5 text-[13.5px] text-[#111827] hover:border-[#c4b5fd]">
                  {data.rangeLabel}<CalendarDays className="h-4 w-4 text-[#6b7280]" />
                </button>
                <button type="button" onClick={() => setPopup(popup === "custom" ? null : "custom")} className={chip(f.preset === "custom")}>Custom Range<CalendarDays className="h-4 w-4" /></button>
              </>
            )}
            {popup === "month" && (
              <div className="absolute left-0 top-12 z-40 w-[290px] rounded-[10px] border border-[#e5e7eb] bg-white p-3 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
                <div className="mb-2 flex items-center justify-between">
                  <button type="button" onClick={() => setYear(year - 1)} className="grid h-8 w-8 place-items-center rounded-[8px] hover:bg-[#f3f4f6]" aria-label="Previous year"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="text-[14px] font-semibold">{year}</span>
                  <button type="button" onClick={() => setYear(year + 1)} disabled={year >= Number(today.slice(0, 4))} className="grid h-8 w-8 place-items-center rounded-[8px] hover:bg-[#f3f4f6] disabled:opacity-30" aria-label="Next year"><ChevronRight className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MONTHS.map((m, i) => {
                    const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
                    const future = `${ym}-01` > today;
                    const active = f.preset === "month" && f.from.startsWith(ym);
                    return <button key={m} type="button" disabled={future} onClick={() => go({ range: "month", m: ym })}
                      className={cn("h-9 rounded-[8px] text-[13px] font-medium disabled:opacity-30", active ? "bg-[#7c3aed] text-white" : "hover:bg-[#f5f3ff] hover:text-[#6d28d9]")}>{m.slice(0, 3)}</button>;
                  })}
                </div>
              </div>
            )}
            {popup === "custom" && (
              <div className="absolute left-0 top-12 z-40 w-[300px] rounded-[10px] border border-[#e5e7eb] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
                <p className="mb-3 text-[14px] font-semibold">Custom range</p>
                <label className="mb-2 block text-[12.5px] text-[#4b5563]">From<input type="date" value={cFrom} max={today} onChange={(e) => setCFrom(e.target.value)} className="mt-1 h-10 w-full rounded-[8px] border border-[#e5e7eb] px-3 text-[14px]" /></label>
                <label className="block text-[12.5px] text-[#4b5563]">To<input type="date" value={cTo} max={today} onChange={(e) => setCTo(e.target.value)} className="mt-1 h-10 w-full rounded-[8px] border border-[#e5e7eb] px-3 text-[14px]" /></label>
                <button type="button" disabled={!cFrom || !cTo} onClick={() => go({ range: "custom", from: cFrom, to: cTo })} className="mt-3 h-10 w-full rounded-[8px] bg-[#7c3aed] text-[14px] font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-50">Show report</button>
              </div>
            )}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            {on("rb-filters", "rb-f-staff") && (
              <label className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#e5e7eb] bg-white pl-3 text-[13.5px] text-[#374151]">
                <UserRound className="h-4 w-4 text-[#6b7280]" />
                <select value={f.userId ?? ""} onChange={(e) => go({ user: e.target.value || null })} aria-label="Report for" className="h-full max-w-[220px] appearance-none rounded-[8px] border-0 bg-transparent pr-8 text-[13.5px] outline-none">
                  <option value="">Whole business</option>
                  {data.staffList.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
                </select>
              </label>
            )}
            {on("rb-filters", "rb-f-channel") && ([["all", "All Sales", Filter], ["offline", "In-store", Store], ["online", "Online", Globe2]] as const).map(([v, l, Icon]) => (
              <button key={v} type="button" onClick={() => go({ channel: v === "all" ? null : v })} className={seg(f.channel === (v as ReportChannel))}><Icon className="h-4 w-4" />{l}</button>
            ))}
          </div>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className={cn("relative min-w-0 transition-opacity", pending && "opacity-60")}>
          {pending && <Loader2 className="absolute left-1/2 top-24 z-10 h-7 w-7 -translate-x-1/2 animate-spin text-[#7c3aed]" />}
          <Sheet data={data} all={false} />
          <button type="button" onClick={() => setPrinting(true)} className="mt-4 inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#7c3aed] bg-white px-4 text-[14px] font-medium text-[#6d28d9] hover:bg-[#f7f3ff]">
            <Printer className="h-4 w-4" />Print Report
          </button>
        </div>

        {isVisible("rb-side") && (
          <aside className="space-y-5">
            {isVisible("rb-r-payment") && (
              <Card icon={Filter} title="Payment Summary">
                <div className="flex flex-wrap items-center gap-5">
                  <Donut parts={data.payments} total={payTotal} />
                  <ul className="min-w-[170px] flex-1 space-y-3 text-[13.5px]">
                    {data.payments.length === 0 && <li className="text-[#9ca3af]">No sales yet.</li>}
                    {data.payments.map((p) => (
                      <li key={p.method} className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: PAY_COLORS[p.method] ?? "#94a3b8" }} />
                        <span className="flex-1 text-[#374151]">{p.method}</span>
                        <span className="text-right tabular-nums text-[#111827]">{money(p.amount)} <span className="text-[#6b7280]">({pct(p.amount, payTotal)})</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            )}
            {isVisible("rb-r-channel") && (
              <Card icon={BarChart3} title="Sales Channel Summary">
                <div className="grid grid-cols-2 gap-3">
                  {([["offline", "In-store Sales", Store], ["online", "Online Sales", Globe2]] as const).map(([key, label, Icon]) => (
                    <button key={key} type="button" onClick={() => go({ channel: f.channel === key ? null : key })} className={cn("rounded-[10px] border p-3.5 text-left transition hover:border-[#c4b5fd]", f.channel === key ? "border-[#7c3aed] bg-[#f7f3ff]" : "border-[#dbe4ff] bg-[#f8faff]")}>
                      <span className="flex items-start gap-2.5">
                        <Icon className="mt-0.5 h-6 w-6 shrink-0 text-[#2563eb]" />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-medium text-[#374151]">{label}</span>
                          <span className="block truncate text-[17px] font-bold text-[#111827]">{money(data.channels[key].amount)}</span>
                          <span className="block text-[12px] text-[#6b7280]">{pct(data.channels[key].amount, salesTotal)}</span>
                          <span className="block text-[12px] text-[#6b7280]">{data.channels[key].orders} Orders</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
            {isVisible("rb-r-online") && f.channel !== "offline" && (
              <Card icon={Truck} title="Online Orders by Status">
                <div className="grid grid-cols-2 gap-2">
                  {data.onlineStatus.map((s) => (
                    <div key={s.status} className="flex items-center justify-between rounded-[8px] border border-[#eef0f4] px-3 py-2 text-[13px]">
                      <span className="text-[#4b5563]">{s.status}</span><b className="text-[#111827]">{s.count}</b>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {isVisible("rb-r-aging") && (
              <Card icon={Clock3} title="Due Aging Summary">
                <div className="space-y-2">
                  {data.aging.map((a, i) => (
                    <div key={a.bucket} className={cn("flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[13.5px]", agingTone[i])}>
                      <Clock3 className="h-4 w-4 shrink-0" /><span className="flex-1 font-medium">{a.bucket}</span>
                      <span className="w-24 text-right font-semibold tabular-nums text-[#111827]">{money(a.amount)}</span>
                      <span className="w-20 text-right text-[#4b5563]">{a.orders} Orders</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t-2 border-[#111827] pt-3">
                  <span className="text-[14px] font-semibold">Total Dues</span><span className="text-[20px] font-bold text-[#dc2626]">{money(data.kpis.due)}</span>
                </div>
              </Card>
            )}
            {isVisible("rb-r-export") && (
              <Card icon={FileText} title="Export Report">
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setPrinting(true)} className="flex h-14 items-center justify-center gap-2.5 rounded-[10px] border border-[#fecaca] bg-[#fff5f5] text-[14px] font-semibold text-[#111827] hover:bg-[#ffeaea]">
                    <FileText className="h-6 w-6 text-[#dc2626]" />Download PDF
                  </button>
                  <button type="button" onClick={exportExcel} disabled={exporting} className="flex h-14 items-center justify-center gap-2.5 rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] text-[14px] font-semibold text-[#111827] hover:bg-[#e3fbe9] disabled:opacity-60">
                    {exporting ? <Loader2 className="h-6 w-6 animate-spin text-[#16a34a]" /> : <FileSpreadsheet className="h-6 w-6 text-[#16a34a]" />}Download Excel
                  </button>
                </div>
                <p className="mt-2.5 text-[12px] leading-5 text-[#6b7280]">PDF: choose <b>Save as PDF</b> in the print window. Excel has every section on its own sheet.</p>
              </Card>
            )}
          </aside>
        )}
      </div>

      {printing && createPortal(<div id="rb-print-root" className="bg-white text-[#111827]"><Sheet data={data} all /></div>, document.body)}
    </div>
  );
}
