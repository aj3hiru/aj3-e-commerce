"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Download, FileSpreadsheet, Loader2, Printer, Receipt, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fyLabel, fyOf, MONTHS, type GstFilters, type GstReport } from "@/lib/gst-report-shared";

const rs = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const dt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

type Tab = "rates" | "hsn" | "products" | "invoices";
const TABS: { key: Tab; label: string }[] = [
  { key: "rates", label: "Rate-wise summary" },
  { key: "hsn", label: "HSN-wise (GSTR-1 Table 12)" },
  { key: "products", label: "Product-wise" },
  { key: "invoices", label: "Invoice-wise" },
];

export function GstReportView({ report }: { report: GstReport }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<Tab>("rates");
  const [exporting, setExporting] = useState(false);
  const f = report.filters;

  function go(patch: Partial<GstFilters>) {
    const n = { ...f, ...patch };
    const sp = new URLSearchParams({ period: n.period, channel: n.channel });
    if (n.period === "month") sp.set("month", n.month);
    if (n.period === "quarter") sp.set("quarter", n.quarter);
    if (n.period === "year") sp.set("fy", String(n.fy));
    if (n.period === "custom") { sp.set("from", n.from); sp.set("to", n.to); }
    start(() => router.push(`${path}?${sp}`, { scroll: false }));
  }

  const thisFy = fyOf(new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10));
  const fys = useMemo(() => Array.from({ length: 6 }, (_, i) => thisFy - i), [thisFy]);
  const months = useMemo(() => {
    const out: string[] = [];
    const now = new Date(Date.now() + 330 * 60_000);
    for (let i = 0; i < 24; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, []);

  async function exportXlsx() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const add = (name: string, rows: Record<string, unknown>[], widths: number[]) => {
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: "No sales in this period" }]);
        ws["!cols"] = widths.map((w) => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, name);
      };
      const t = report.totals;
      const head = XLSX.utils.aoa_to_sheet([
        [report.business.name], [report.business.address ?? ""], [report.business.gstin ? `GSTIN: ${report.business.gstin}` : "GSTIN: not set"], [],
        ["GST Report", report.label], ["Period", `${report.from} to ${report.to}`], ["Sales", f.channel === "all" ? "Store + Online" : f.channel === "offline" ? "Store" : "Online"], [],
        ["Invoices", t.invoices], ["Taxable value", t.taxable], ["CGST", t.cgst], ["SGST", t.sgst], ["Total tax", t.tax], ["Invoice value", t.value],
      ]);
      head["!cols"] = [{ wch: 18 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, head, "Summary");
      add("Rate-wise", report.rates.map((r) => ({ "GST %": r.rate, "Taxable value": r.taxable, CGST: r.cgst, SGST: r.sgst, "Total tax": r.tax, "Invoice value": r.value })), [8, 15, 12, 12, 12, 15]);
      add("HSN", report.hsn.map((r) => ({ HSN: r.hsn, Description: r.description, UQC: r.uqc, "Total quantity": r.qty, "GST %": r.rate, "Taxable value": r.taxable, "Central tax": r.cgst, "State/UT tax": r.sgst, "Integrated tax": 0, "Total value": r.value })), [12, 34, 8, 12, 8, 14, 12, 12, 12, 14]);
      add("Products", report.products.map((r) => ({ Product: r.name, HSN: r.hsn, "GST %": r.rate, Qty: r.qty, "Taxable value": r.taxable, Tax: r.tax, Value: r.value })), [36, 12, 8, 8, 14, 12, 14]);
      add("Invoices", report.invoices.map((r) => ({ "Invoice no.": r.number, Date: dt(r.date), Customer: r.customer, Sale: r.channel, "Taxable value": r.taxable, CGST: r.cgst, SGST: r.sgst, "Total tax": r.tax, "Invoice value": r.value })), [16, 13, 24, 8, 14, 11, 11, 11, 14]);
      XLSX.writeFile(wb, `GST_Report_${report.from}_to_${report.to}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  const sel = "h-9 rounded-md border border-admin-gray-200 bg-white px-2.5 text-sm text-admin-gray-900 outline-none focus:border-admin-primary";
  const seg = (on: boolean) => cn("h-9 px-3.5 text-sm font-medium first:rounded-l-md last:rounded-r-md border -ml-px first:ml-0", on ? "z-10 border-admin-primary bg-admin-primary text-white" : "border-admin-gray-200 bg-white text-admin-gray-700 hover:bg-admin-gray-50");
  const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-admin-gray-500";
  const thr = cn(th, "text-right");
  const td = "px-3 py-2 text-sm text-admin-gray-800";
  const tdr = cn(td, "text-right tabular-nums");
  const t = report.totals;

  return (
    <div className="space-y-4 print:space-y-2">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm print:hidden">
        <div className="flex">
          {(["month", "quarter", "year", "custom"] as const).map((p) => (
            <button key={p} type="button" onClick={() => go({ period: p })} className={seg(f.period === p)}>{p === "month" ? "Monthly" : p === "quarter" ? "Quarterly" : p === "year" ? "Yearly" : "Custom"}</button>
          ))}
        </div>
        {f.period === "month" && (
          <select value={f.month} onChange={(e) => go({ month: e.target.value })} className={sel} aria-label="Month">
            {months.map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}
          </select>
        )}
        {f.period === "quarter" && (
          <select value={f.quarter} onChange={(e) => go({ quarter: e.target.value })} className={sel} aria-label="Quarter">
            {fys.flatMap((y) => [4, 3, 2, 1].map((q) => <option key={`${y}-Q${q}`} value={`${y}-Q${q}`}>Q{q} {["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"][q - 1]} · {fyLabel(y)}</option>))}
          </select>
        )}
        {f.period === "year" && (
          <select value={f.fy} onChange={(e) => go({ fy: Number(e.target.value) })} className={sel} aria-label="Financial year">
            {fys.map((y) => <option key={y} value={y}>{fyLabel(y)} (Apr {y} – Mar {y + 1})</option>)}
          </select>
        )}
        {f.period === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={f.from} onChange={(e) => e.target.value && go({ from: e.target.value })} className={sel} aria-label="From" />
            <span className="text-admin-gray-400">to</span>
            <input type="date" value={f.to} onChange={(e) => e.target.value && go({ to: e.target.value })} className={sel} aria-label="To" />
          </div>
        )}
        <select value={f.channel} onChange={(e) => go({ channel: e.target.value as GstFilters["channel"] })} className={sel} aria-label="Sales">
          <option value="all">Store + Online</option><option value="offline">Store</option><option value="online">Online</option>
        </select>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-admin-gray-400" />}
        <div className="ml-auto flex gap-2">
          <Link href="/admin/ecommerce/tax-settings" className="flex h-9 items-center gap-1.5 rounded-md border border-admin-gray-200 bg-white px-3 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50"><Settings2 className="h-4 w-4" /> Tax settings</Link>
          <button type="button" onClick={() => window.print()} className="flex h-9 items-center gap-1.5 rounded-md border border-admin-gray-200 bg-white px-3 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50"><Printer className="h-4 w-4" /> Print</button>
          <button type="button" onClick={exportXlsx} disabled={exporting} className="flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Export sheet
          </button>
        </div>
      </div>

      {/* Header for print + business GSTIN */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <p className="text-sm text-admin-gray-600"><b className="text-admin-gray-900">{report.business.name}</b>{report.business.gstin ? ` · GSTIN ${report.business.gstin}` : " · GSTIN not set in Business Settings"}</p>
        <p className="text-sm font-semibold text-admin-gray-900">{report.label} <span className="font-normal text-admin-gray-500">({report.from} → {report.to})</span></p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[["Invoices", String(t.invoices)], ["Taxable value", rs(t.taxable)], ["CGST", rs(t.cgst)], ["SGST", rs(t.sgst)], ["Total GST", rs(t.tax)], ["Invoice value", rs(t.value)]].map(([k, v], i) => (
          <div key={k} className={cn("rounded-xl border bg-white p-3.5 shadow-sm", i === 4 ? "border-admin-primary/40" : "border-admin-gray-200")}>
            <p className="text-xs text-admin-gray-500">{k}</p>
            <p className={cn("mt-1 text-lg font-bold tabular-nums", i === 4 ? "text-admin-primary" : "text-admin-gray-900")}>{v}</p>
          </div>
        ))}
      </div>

      {/* Tabs + table */}
      <div className="overflow-hidden rounded-xl border border-admin-gray-200 bg-white shadow-sm">
        <div className="flex overflow-x-auto border-b border-admin-gray-200 print:hidden">
          {TABS.map((x) => (
            <button key={x.key} type="button" onClick={() => setTab(x.key)}
              className={cn("whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium", tab === x.key ? "border-admin-primary text-admin-primary" : "border-transparent text-admin-gray-600 hover:text-admin-gray-900")}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          {tab === "rates" && (
            <table className="w-full min-w-[640px]">
              <thead className="bg-admin-gray-50"><tr><th className={th}>GST rate</th><th className={thr}>Lines</th><th className={thr}>Taxable value</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>Total tax</th><th className={thr}>Invoice value</th></tr></thead>
              <tbody className="divide-y divide-admin-gray-100">
                {report.rates.map((r) => <tr key={r.rate}><td className={td}>{r.rate}%</td><td className={tdr}>{r.lines}</td><td className={tdr}>{rs(r.taxable)}</td><td className={tdr}>{rs(r.cgst)}</td><td className={tdr}>{rs(r.sgst)}</td><td className={tdr}>{rs(r.tax)}</td><td className={tdr}>{rs(r.value)}</td></tr>)}
                <Total cols={[`${report.rates.reduce((n, r) => n + r.lines, 0)}`, rs(t.taxable), rs(t.cgst), rs(t.sgst), rs(t.tax), rs(t.value)]} />
              </tbody>
            </table>
          )}
          {tab === "hsn" && (
            <table className="w-full min-w-[860px]">
              <thead className="bg-admin-gray-50"><tr><th className={th}>HSN</th><th className={th}>Description</th><th className={th}>UQC</th><th className={thr}>Qty</th><th className={thr}>Rate</th><th className={thr}>Taxable value</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>Total value</th></tr></thead>
              <tbody className="divide-y divide-admin-gray-100">
                {report.hsn.map((r) => <tr key={`${r.hsn}-${r.rate}`}><td className={cn(td, "font-medium", r.hsn === "—" && "text-amber-600")}>{r.hsn === "—" ? "Not set" : r.hsn}</td><td className={cn(td, "max-w-[240px] truncate")} title={r.description}>{r.description}</td><td className={td}>{r.uqc}</td><td className={tdr}>{num(r.qty)}</td><td className={tdr}>{r.rate}%</td><td className={tdr}>{rs(r.taxable)}</td><td className={tdr}>{rs(r.cgst)}</td><td className={tdr}>{rs(r.sgst)}</td><td className={tdr}>{rs(r.value)}</td></tr>)}
                <Total cols={["", "", num(report.hsn.reduce((n, r) => n + r.qty, 0)), "", rs(t.taxable), rs(t.cgst), rs(t.sgst), rs(t.value)]} />
              </tbody>
            </table>
          )}
          {tab === "products" && (
            <table className="w-full min-w-[760px]">
              <thead className="bg-admin-gray-50"><tr><th className={th}>Product</th><th className={th}>HSN</th><th className={thr}>Rate</th><th className={thr}>Qty</th><th className={thr}>Taxable value</th><th className={thr}>GST</th><th className={thr}>Value</th></tr></thead>
              <tbody className="divide-y divide-admin-gray-100">
                {report.products.map((r) => <tr key={`${r.productId}-${r.rate}`}><td className={cn(td, "max-w-[300px] truncate")} title={r.name}>{r.name}</td><td className={td}>{r.hsn === "—" ? "—" : r.hsn}</td><td className={tdr}>{r.rate}%</td><td className={tdr}>{num(r.qty)}</td><td className={tdr}>{rs(r.taxable)}</td><td className={tdr}>{rs(r.tax)}</td><td className={tdr}>{rs(r.value)}</td></tr>)}
                <Total cols={["", "", num(report.products.reduce((n, r) => n + r.qty, 0)), rs(t.taxable), rs(t.tax), rs(t.value)]} />
              </tbody>
            </table>
          )}
          {tab === "invoices" && (
            <table className="w-full min-w-[900px]">
              <thead className="bg-admin-gray-50"><tr><th className={th}>Invoice</th><th className={th}>Date</th><th className={th}>Customer</th><th className={th}>Sale</th><th className={thr}>Taxable</th><th className={thr}>CGST</th><th className={thr}>SGST</th><th className={thr}>Value</th><th className="print:hidden" /></tr></thead>
              <tbody className="divide-y divide-admin-gray-100">
                {report.invoices.map((r) => <tr key={r.id}><td className={cn(td, "font-medium")}>{r.number}</td><td className={td}>{dt(r.date)}</td><td className={cn(td, "max-w-[200px] truncate")}>{r.customer}</td><td className={td}>{r.channel}</td><td className={tdr}>{rs(r.taxable)}</td><td className={tdr}>{rs(r.cgst)}</td><td className={tdr}>{rs(r.sgst)}</td><td className={tdr}>{rs(r.value)}</td>
                  <td className="px-3 py-2 text-right print:hidden"><a href={`/admin/ecommerce/invoice/${r.id}`} target="_blank"rel="noreferrer"title="Tax invoice"className="inline-flex items-center gap-1 text-xs font-medium text-admin-primary"><Receipt className="h-3.5 w-3.5"/> Invoice</a></td></tr>)}
                <Total cols={["", "", "", rs(t.taxable), rs(t.cgst), rs(t.sgst), rs(t.value), ""]} />
              </tbody>
            </table>
          )}
          {report.totals.invoices === 0 && <p className="px-4 py-10 text-center text-sm text-admin-gray-500"><Download className="mx-auto mb-2 h-6 w-6 text-admin-gray-300" />No sales in this period.</p>}
        </div>
      </div>
      <p className="px-1 text-xs text-admin-gray-500 print:hidden">Counts store bills and delivered online orders (cancelled orders are left out). All sales are treated as within your state, so GST is split equally into CGST and SGST.</p>
    </div>
  );
}

function Total({ cols }: { cols: string[] }) {
  return (
    <tr className="bg-admin-gray-50 font-semibold">
      <td className="px-3 py-2 text-sm text-admin-gray-900">Total</td>
      {cols.map((c, i) => <td key={i} className="px-3 py-2 text-right text-sm tabular-nums text-admin-gray-900">{c}</td>)}
    </tr>
  );
}
