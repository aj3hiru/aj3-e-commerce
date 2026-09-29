"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Ban, Bike, CheckCircle2, Clock, Download, IndianRupee, Loader2, PackageCheck, Search, Truck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentReportRow, DeliveryFilters, DeliveryHistoryRow } from "@/lib/delivery-history";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "—");
const dur = (m: number | null) => (m === null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`);

const PRESETS = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["month", "This month"], ["30d", "Last 30 days"]] as const;

interface Props {
  tab: "history" | "report";
  filters: DeliveryFilters;
  agents: { id: number; name: string }[];
  rows: DeliveryHistoryRow[];
  report: AgentReportRow[];
  totals: { assigned: number; delivered: number; failed: number; canceled: number; active: number; collected: number };
}

/** Deliveries Board → History (every order, what happened) and Report (each delivery agent's totals). */
export function DeliveryHistoryView({ tab, filters: f, agents, rows, report, totals }: Props) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(f.q);

  function go(patch: Partial<Record<string, string | null>>) {
    const sp = new URLSearchParams({ view: "all", tab, range: f.preset, ...(f.preset === "custom" ? { from: f.from, to: f.to } : {}), status: f.status, ...(f.agent ? { agent: String(f.agent) } : {}), ...(q ? { q } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === undefined) sp.delete(k);
      else sp.set(k, v);
    }
    start(() => router.push(`${path}?${sp}`, { scroll: false }));
  }

  function exportCsv() {
    const head = tab === "report"
      ? ["Agent", "Assigned", "Delivered", "Failed attempts", "Cancelled", "Still out", "Collected", "Cash", "UPI", "Other", "Avg time (min)", "Success %"]
      : ["Order", "Customer", "Phone", "Agent", "Status", "Assigned", "Finished", "Time (min)", "Failed attempts", "Amount", "Collected"];
    const body = tab === "report"
      ? report.map((r) => [r.name, r.assigned, r.delivered, r.failed, r.canceled, r.active, r.collected, r.cash, r.upi, r.other, r.avgMinutes ?? "", r.successRate ?? ""])
      : rows.map((r) => [r.number, r.customer, r.phone ?? "", r.agent ?? "", r.status, when(r.assignedAt), when(r.finishedAt), r.minutes ?? "", r.failedAttempts.map((a) => a.note).join(" | "), r.total, r.collected.reduce((n, p) => n + p.amount, 0)]);
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `Deliveries_${tab}_${f.from}_to_${f.to}.csv`;
    a.click();
  }

  const chip = (on: boolean) => cn("h-9 rounded-md border px-3 text-sm font-medium transition", on ? "border-admin-primary bg-admin-primary text-white" : "border-admin-gray-200 bg-white text-admin-gray-700 hover:bg-admin-gray-50");
  const sel = "h-9 rounded-md border border-admin-gray-200 bg-white px-2.5 text-sm outline-none focus:border-admin-primary";
  const card = (icon: React.ReactNode, tint: string, value: string, label: string, onClick?: () => void, on?: boolean) => (
    <button type="button" onClick={onClick} disabled={!onClick} className={cn("flex items-center gap-3 rounded-xl border bg-white p-3.5 text-left shadow-sm", on ? "border-admin-primary ring-1 ring-admin-primary/30" : "border-admin-gray-200", onClick && "hover:border-admin-primary/50")}>
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", tint)}>{icon}</span>
      <span className="min-w-0"><span className="block text-lg font-bold text-admin-gray-900">{value}</span><span className="block truncate text-xs text-admin-gray-500">{label}</span></span>
    </button>
  );
  const statusBadge = (r: DeliveryHistoryRow) => {
    const [t, c] = r.status === "Delivered" ? ["Delivered", "bg-emerald-50 text-emerald-700"] : r.status === "Canceled" ? ["Cancelled", "bg-red-50 text-red-700"] : r.status === "Out for Delivery" ? ["On the way", "bg-sky-50 text-sky-700"] : ["Waiting", "bg-amber-50 text-amber-700"];
    return <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", c)}>{t}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-admin-gray-200 bg-white p-3 shadow-sm">
        {PRESETS.map(([k, l]) => <button key={k} type="button" onClick={() => go({ range: k, from: null, to: null })} className={chip(f.preset === k)}>{l}</button>)}
        <input type="date" value={f.from} onChange={(e) => e.target.value && go({ range: "custom", from: e.target.value, to: f.to })} className={sel} aria-label="From" />
        <span className="text-admin-gray-400">–</span>
        <input type="date" value={f.to} onChange={(e) => e.target.value && go({ range: "custom", from: f.from, to: e.target.value })} className={sel} aria-label="To" />
        <select value={f.agent ?? ""} onChange={(e) => go({ agent: e.target.value || null })} className={sel} aria-label="Delivery agent">
          <option value="">All delivery agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-admin-gray-400" />}
        <button type="button" onClick={exportCsv} className="ml-auto flex h-9 items-center gap-1.5 rounded-md border border-admin-gray-200 bg-white px-3 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50"><Download className="h-4 w-4" /> Export</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {card(<Truck className="h-5 w-5" />, "bg-blue-50 text-blue-600", String(totals.assigned), "Handed to agents", tab === "history" ? () => go({ status: "all" }) : undefined, tab === "history" && f.status === "all")}
        {card(<PackageCheck className="h-5 w-5" />, "bg-emerald-50 text-emerald-600", String(totals.delivered), "Delivered", tab === "history" ? () => go({ status: "delivered" }) : undefined, f.status === "delivered")}
        {card(<AlertTriangle className="h-5 w-5" />, "bg-orange-50 text-orange-600", String(totals.failed), "Failed attempts", tab === "history" ? () => go({ status: "failed" }) : undefined, f.status === "failed")}
        {card(<Ban className="h-5 w-5" />, "bg-red-50 text-red-600", String(totals.canceled), "Cancelled", tab === "history" ? () => go({ status: "canceled" }) : undefined, f.status === "canceled")}
        {card(<Bike className="h-5 w-5" />, "bg-sky-50 text-sky-600", String(totals.active), "Still out / waiting", tab === "history" ? () => go({ status: "active" }) : undefined, f.status === "active")}
        {card(<IndianRupee className="h-5 w-5" />, "bg-violet-50 text-violet-600", money(totals.collected), "Collected on delivery")}
      </div>

      {tab === "report" ? (
        <div className="overflow-x-auto rounded-xl border border-admin-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-admin-gray-50 text-left text-xs uppercase tracking-wide text-admin-gray-500">
              <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:font-semibold">
                <th>Delivery agent</th><th className="text-right">Assigned</th><th className="text-right">Delivered</th><th className="text-right">Failed</th><th className="text-right">Cancelled</th>
                <th className="text-right">Still out</th><th className="text-right">Collected</th><th className="text-right">Cash / UPI / Other</th><th className="text-right">Avg time</th><th className="text-right">Success</th><th />
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-gray-100">
              {report.map((r) => (
                <tr key={String(r.id)} className="[&>td]:px-3 [&>td]:py-2.5">
                  <td className="font-semibold text-admin-gray-900"><span className="inline-flex items-center gap-2"><Users className="h-4 w-4 text-admin-gray-400" />{r.name}</span></td>
                  <td className="text-right">{r.assigned}</td>
                  <td className="text-right font-semibold text-emerald-600">{r.delivered}</td>
                  <td className="text-right text-orange-600">{r.failed}</td>
                  <td className="text-right text-red-600">{r.canceled}</td>
                  <td className="text-right text-sky-600">{r.active}</td>
                  <td className="text-right font-semibold">{money(r.collected)}</td>
                  <td className="whitespace-nowrap text-right text-xs text-admin-gray-600">{money(r.cash)} / {money(r.upi)} / {money(r.other)}</td>
                  <td className="text-right"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-admin-gray-400" />{dur(r.avgMinutes)}</span></td>
                  <td className="text-right">{r.successRate === null ? "—" : `${r.successRate}%`}</td>
                  <td className="text-right">{r.id !== null && <button type="button" onClick={() => start(() => router.push(`${path}?view=all&tab=history&range=${f.preset}${f.preset === "custom" ? `&from=${f.from}&to=${f.to}` : ""}&agent=${r.id}`))} className="text-xs font-semibold text-admin-primary hover:underline">Orders</button>}</td>
                </tr>
              ))}
              {report.length === 0 && <tr><td colSpan={11} className="px-3 py-10 text-center text-admin-gray-500">No delivery agents yet.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-admin-gray-200 bg-white shadow-sm">
          <form className="flex flex-wrap items-center gap-2 border-b border-admin-gray-100 p-3" onSubmit={(e) => { e.preventDefault(); go({ q }); }}>
            {([["all", "All"], ["delivered", "Delivered"], ["failed", "Failed"], ["canceled", "Cancelled"], ["active", "Out now"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => go({ status: k })} className={chip(f.status === k)}>{l}</button>
            ))}
            <span className="relative ml-auto">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order, customer, phone, agent" className="h-9 w-[260px] rounded-md border border-admin-gray-200 pl-8 pr-3 text-sm outline-none focus:border-admin-primary" />
            </span>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-admin-gray-50 text-left text-xs uppercase tracking-wide text-admin-gray-500">
                <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:font-semibold">
                  <th>Order</th><th>Customer</th><th>Delivery agent</th><th>Status</th><th>Handed over</th><th>Finished</th><th>Time taken</th><th>Failed attempts</th><th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top [&>td]:px-3 [&>td]:py-2.5">
                    <td><Link href={`/admin/ecommerce/orders/${r.id}`} className="font-semibold text-[#2563eb] hover:underline">{r.number}</Link><div className="text-xs text-admin-gray-500">{r.items} item{r.items === 1 ? "" : "s"}</div></td>
                    <td><div className="font-medium text-admin-gray-900">{r.customer}</div><div className="max-w-[240px] truncate text-xs text-admin-gray-500" title={r.address}>{r.phone ?? ""}{r.phone && r.address ? " · " : ""}{r.address}</div></td>
                    <td className="font-medium">{r.agent ?? <span className="text-admin-gray-400">—</span>}</td>
                    <td>{statusBadge(r)}{r.status === "Canceled" && r.cancelReason && <div className="mt-1 max-w-[200px] text-xs text-red-600">{r.cancelReason}</div>}</td>
                    <td className="whitespace-nowrap text-xs text-admin-gray-600">{when(r.assignedAt)}</td>
                    <td className="whitespace-nowrap text-xs text-admin-gray-600">{when(r.finishedAt)}</td>
                    <td className="whitespace-nowrap text-xs">{dur(r.minutes)}</td>
                    <td className="text-xs">{r.failedAttempts.length ? r.failedAttempts.map((a, i) => <div key={i} className="text-orange-700">{when(a.at)} — {a.note}</div>) : <span className="text-admin-gray-300">—</span>}</td>
                    <td className="whitespace-nowrap text-right">
                      <div className="font-semibold">{money(r.total)}</div>
                      <div className={cn("text-xs", r.paymentStatus === "Paid" ? "text-emerald-600" : "text-amber-600")}>{r.paymentStatus === "Paid" ? (r.collected.length ? r.collected.map((p) => p.method).join(" + ") : "Paid") : "Not collected"}</div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-12 text-center text-admin-gray-500"><CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-admin-gray-300" />No deliveries match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
