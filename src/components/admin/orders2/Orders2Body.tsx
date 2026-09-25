"use client";

import Link from "next/link";
import { OrderDecision } from "@/components/admin/OrderDecision";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowDown, ArrowUp, Ban, CalendarDays, CheckCircle2, ChevronDown, ChevronsUpDown, Clock, Download,
  Eye, IndianRupee, Loader2, MapPin, MessageCircle, Package, Phone, Printer, Search, ShoppingBag, Truck, Wallet, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { Order2Row, Orders2Data } from "@/lib/orders2";
import { Modal, Pager } from "@/components/admin/campaigns2/ui";
import { orderStatusVariant, paymentStatusVariant, STATUS_BTN_STYLES } from "@/components/admin/StatusDropdown";
import { IconAction, StatusBadge, StatusPill, type PillOption } from "@/components/admin/ui/buttons";
import { money } from "@/components/admin/campaigns2/format";

const PAGE_PATH = "/admin/ecommerce/orders";
const EVT_EXPORT = "orders2:export";
const PAISA = 0.004;

const PAYMENT_OPTIONS: readonly PillOption<string>[] = [
  { value: "Paid", label: "Paid", variant: "success" },
  { value: "Unpaid", label: "Unpaid", variant: "secondary" },
];

export function Orders2HeaderButtons() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_EXPORT))}
      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]">
      <Download className="h-4 w-4" /> Export
    </button>
  );
}

/* ── dates ── */
const istTodayYmd = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
function shiftYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const longDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
function fmtDateTime(iso: string) {
  const p = Object.fromEntries(dtFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
}

/** The colour of a status dot, taken from the same palette as the pills. */
const statusDot = (status: string) => STATUS_BTN_STYLES[orderStatusVariant(status)].background;
const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Pending: Clock, "In Progress": Package, "Out for Delivery": Truck, Delivered: CheckCircle2, Canceled: Ban,
};

type SortKey = "created" | "total" | "customer" | "status";
interface Filters {
  payment: "all" | "Paid" | "Unpaid";
  method: string;
  product: string;
  dues: "all" | "with" | "without";
  agent: string; // "all" | "none" | agent id
}
const NO_FILTERS: Filters = { payment: "all", method: "all", product: "all", dues: "all", agent: "all" };

const ROW_H = 84;
const HEAD_H = 50;
const MIN_ROWS = 5;
const td = "border-b border-[#eef0f4] px-3 align-middle";

export function Orders2Body({ data, canEdit, canBill, canDecide = canEdit, agents = [] }: {
  data: Orders2Data; canEdit: boolean; canBill: boolean; canDecide?: boolean; agents?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [navigating, startNavigate] = useTransition();

  const [rows, setRows] = useState(data.rows);
  useEffect(() => setRows(data.rows), [data.rows]);

  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "created", dir: "desc" });
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [details, setDetails] = useState<Order2Row | null>(null);
  // Bulk actions: tick orders, then accept them or hand them to a delivery agent in one go.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [bulkAgent, setBulkAgent] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const canAssign = agents.length > 0;
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((s) => ({ ...s, [k]: v }));
  const c = data.cards;
  const range = data.range;

  const orderOptions = useMemo<readonly PillOption<string>[]>(
    () => data.statuses.map((st) => ({ value: st, label: st, variant: orderStatusVariant(st) })),
    [data.statuses]
  );
  const methods = useMemo(() => [...new Set(rows.map((r) => r.paymentMethod).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (f.payment !== "all" && r.paymentStatus !== f.payment) return false;
      if (f.method !== "all" && r.paymentMethod !== f.method) return false;
      if (f.product !== "all" && !r.items.some((i) => String(i.productId) === f.product)) return false;
      if (f.dues === "with" && !(r.dueBalance > PAISA)) return false;
      if (f.dues === "without" && r.dueBalance > PAISA) return false;
      if (f.agent === "none" && r.agentId !== null) return false;
      if (f.agent !== "all" && f.agent !== "none" && String(r.agentId) !== f.agent) return false;
      if (term) {
        const hay = `${r.orderNumber} ${r.customerName} ${r.customerEmail ?? ""} ${r.customerPhone ?? ""} ${r.shippingAddress ?? ""} ${r.items.map((i) => i.productName).join(" ")}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "total": return (a.total - b.total) * dir;
        case "customer": return a.customerName.toLowerCase().localeCompare(b.customerName.toLowerCase()) * dir;
        case "status": return a.orderStatus.localeCompare(b.orderStatus) * dir;
        default: return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      }
    });
  }, [rows, f, q, sort]);

  useEffect(() => setPage(1), [f, q, sort, pageSize, data.type, range]);
  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  const start = pageSize === 0 ? 0 : (cur - 1) * pageSize;
  const pageRows = pageSize === 0 ? filtered : filtered.slice(start, start + pageSize);
  const filtersActive = JSON.stringify(f) !== JSON.stringify(NO_FILTERS) || search.trim() !== "";
  const shownValue = useMemo(() => r2(filtered.reduce((s, r) => s + r.total, 0)), [filtered]);

  /** Hand an order to a delivery agent (it then shows Out for Delivery). */
  async function assign(r: Order2Row, agentId: number | null, quiet = false) {
    setBusy((s) => new Set(s).add(r.id));
    const res = await fetch(`/api/ecommerce/orders/${r.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", agentId }) })
      .then((x) => x.json()).catch(() => null) as { success?: boolean; message?: string } | null;
    setBusy((s) => { const n = new Set(s); n.delete(r.id); return n; });
    if (!res?.success) { if (!quiet) setToast({ ok: false, text: res?.message || "Couldn't assign the order." }); return false; }
    const name = agents.find((a) => a.id === agentId)?.name ?? null;
    setRows((list) => list.map((x) => (x.id !== r.id ? x : {
      ...x, agentId, agent: name,
      orderStatus: agentId && (x.orderStatus === "Pending" || x.orderStatus === "In Progress") ? "Out for Delivery" : !agentId && x.orderStatus === "Out for Delivery" ? "In Progress" : x.orderStatus,
    })));
    if (!quiet) setToast({ ok: true, text: name ? `${r.orderNumber} → ${name} · Out for Delivery.` : `${r.orderNumber}: agent removed.` });
    return true;
  }

  async function bulk(kind: "accept" | "assign") {
    const list = rows.filter((r) => picked.has(r.id));
    if (!list.length) return;
    setBulkBusy(true);
    let ok = 0;
    for (const r of list) {
      if (kind === "accept") {
        if (r.orderStatus !== "Pending") continue;
        const res = await fetch(`/api/ecommerce/orders/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderStatus: "In Progress" }) })
          .then((x) => x.json()).catch(() => null) as { success?: boolean } | null;
        if (res?.success) { ok++; setRows((l) => l.map((x) => (x.id === r.id ? { ...x, orderStatus: "In Progress" } : x))); }
      } else if (bulkAgent && !["Delivered", "Canceled"].includes(r.orderStatus)) {
        if (await assign(r, Number(bulkAgent), true)) ok++;
      }
    }
    setBulkBusy(false);
    setPicked(new Set());
    setToast({ ok: ok > 0, text: kind === "accept" ? `${ok} order${ok === 1 ? "" : "s"} accepted.` : `${ok} order${ok === 1 ? "" : "s"} sent out with ${agents.find((a) => String(a.id) === bulkAgent)?.name ?? "the agent"}.` });
    router.refresh();
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "customer" ? "asc" : "desc" }));
  }

  async function patch(r: Order2Row, body: { orderStatus?: string; paymentStatus?: string }) {
    const before = { orderStatus: r.orderStatus, paymentStatus: r.paymentStatus };
    setBusy((s) => new Set(s).add(r.id));
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, ...body } : x)));
    try {
      const res = await fetch(`/api/ecommerce/orders/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || d.success !== true) {
        setRows((list) => list.map((x) => (x.id === r.id ? { ...x, ...before } : x)));
        setToast({ ok: false, text: d.message || "Could not update the order. Please try again." });
        return;
      }
      setToast({ ok: true, text: body.orderStatus ? `${r.orderNumber} is now ${body.orderStatus}.` : `${r.orderNumber} marked ${body.paymentStatus}.` });
      router.refresh();
    } catch {
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, ...before } : x)));
      setToast({ ok: false, text: "Could not reach the server. Please try again." });
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(r.id); return n; });
    }
  }

  function exportCsv() {
    if (filtered.length === 0) return setToast({ ok: false, text: "There are no orders to export." });
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["Order", "Date", "Customer", "Phone", "Email", "Items", "Total", "Paid", "Due", "Payment", "Method", "Status", "Address", "Products"].join(",")];
    for (const r of filtered) {
      lines.push([r.orderNumber, fmtDateTime(r.createdAt), r.customerName, r.customerPhone, r.customerEmail, r.itemCount,
        r.total.toFixed(2), r.paid.toFixed(2), r.dueBalance.toFixed(2), r.paymentStatus, r.paymentMethod, r.orderStatus,
        r.shippingAddress, r.items.map((i) => `${i.productName} x${i.qty}`).join(" | ")].map(cell).join(","));
    }
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${data.type || "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const exportRef = useRef(exportCsv);
  exportRef.current = exportCsv;
  useEffect(() => {
    const on = () => exportRef.current();
    window.addEventListener(EVT_EXPORT, on);
    return () => window.removeEventListener(EVT_EXPORT, on);
  }, []);

  const navigate = (url: string) => startNavigate(() => router.push(url, { scroll: false }));
  const goType = (t: string) => navigate(`${PAGE_PATH}?${new URLSearchParams({ ...(t ? { type: t } : {}), from: range.from, to: range.to }).toString()}`);

  const cols = [
    { key: "or2-c-select", w: "w-[46px]" },
    { key: "or2-c-order", w: "w-[200px]" },
    { key: "or2-c-customer", w: "" },
    { key: "or2-c-items", w: "w-[110px]" },
    { key: "or2-c-total", w: "w-[150px]" },
    { key: "or2-c-payment", w: "w-[150px]" },
    { key: "or2-c-status", w: "w-[190px]" },
    { key: "or2-c-agent", w: "w-[170px]" },
    { key: "or2-c-actions", w: "w-[140px]" },
  ].filter((x) => show("or2-table") && show(x.key) && (x.key !== "or2-c-agent" || canAssign) && (x.key !== "or2-c-select" || canEdit));

  return (
    <div className={cn("space-y-5", !loaded && "invisible")} aria-busy={navigating}>
      {show("or2-range") && <RangeBar range={range} type={data.type} navigate={navigate} pending={navigating} />}

      {show("or2-tabs") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Order status">
            <TabButton active={data.type === ""} onClick={() => goType("")} label="All Orders" count={data.statusCounts.reduce((s, x) => s + x.count, 0)} />
            {data.statusCounts.map((s) => (
              <TabButton key={s.status} active={data.type === s.status} onClick={() => goType(s.status)} label={`${s.status} Orders`} count={s.count} dot={statusDot(s.status)} />
            ))}
          </div>
        </section>
      )}

      {show("or2-cards") && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {show("or2-k-total") && <Card icon={ShoppingBag} tint="bg-blue-50 text-blue-600" value={String(c.total)} label={data.type ? `${data.type} Orders` : "All Orders"} sub={money(c.totalValue) + " in this range"} />}
          {show("or2-k-today") && <Card icon={Clock} tint="bg-violet-50 text-violet-600" value={String(c.today)} label="Today's Orders" sub={money(c.todayValue)} />}
          {show("or2-k-unpaid") && <Card icon={Wallet} tint="bg-red-50 text-red-600" value={String(c.unpaid)} label="Unpaid" sub={money(c.unpaidValue) + " not collected"} />}
          {show("or2-k-value") && <Card icon={IndianRupee} tint="bg-emerald-50 text-emerald-600" value={money(c.totalValue)} label="Order Value" sub={`${longDate(range.from)} – ${longDate(range.to)}`} />}
          {data.statuses.slice(0, 4).map((st) =>
            show(`or2-k-${st.toLowerCase().replace(/\s+/g, "-")}`) ? (
              <Card key={st} icon={STATUS_ICON[st] ?? Package} tint="bg-admin-gray-100 text-admin-gray-700"
                value={String(c.byStatus[st]?.count ?? 0)} label={st} sub={money(c.byStatus[st]?.value ?? 0)} />
            ) : null
          )}
        </div>
      )}

      {show("or2-filters") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {show("or2-f-payment") && (
              <Select icon={Wallet} label="Payment" value={f.payment} onChange={(v) => set("payment", v as Filters["payment"])} on={f.payment !== "all"}>
                <option value="all">Paid and unpaid</option>
                <option value="Paid">Paid</option>
                <option value="Unpaid">Unpaid</option>
              </Select>
            )}
            {show("or2-f-method") && (
              <Select icon={IndianRupee} label="Payment Method" value={f.method} onChange={(v) => set("method", v)} on={f.method !== "all"}>
                <option value="all">All methods</option>
                {methods.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            )}
            {show("or2-f-product") && (
              <Select icon={Package} label="Product" value={f.product} onChange={(v) => set("product", v)} on={f.product !== "all"}>
                <option value="all">All products</option>
                {data.products.map((p) => <option key={p.id} value={String(p.id)}>{p.name} ({p.count})</option>)}
              </Select>
            )}
            {show("or2-f-agent") && canAssign && (
              <Select icon={Truck} label="Delivery agent" value={f.agent} onChange={(v) => set("agent", v)} on={f.agent !== "all"}>
                <option value="all">All agents</option>
                <option value="none">Not assigned</option>
                {agents.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
              </Select>
            )}
            {show("or2-f-dues") && (
              <Select icon={Wallet} label="Balance" value={f.dues} onChange={(v) => set("dues", v as Filters["dues"])} on={f.dues !== "all"}>
                <option value="all">All orders</option>
                <option value="with">Money still owed</option>
                <option value="without">Nothing owed</option>
              </Select>
            )}
          </div>
        </section>
      )}

      {show("or2-table") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-[15px] text-admin-gray-900">
            <label className="flex items-center gap-2">
              Show
              <span className="relative">
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Entries per page"
                  className="h-10 w-[90px] appearance-none rounded-[0.375rem] border border-[#dee2e6] bg-white pl-3 pr-8 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15">
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value={0}>All</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-600" />
              </span>
              entries
            </label>
            {filtersActive && (
              <button type="button" onClick={() => { setF(NO_FILTERS); setSearch(""); }} className="flex items-center gap-1 text-[13px] font-medium text-[#2563eb] hover:underline">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
            {show("or2-t-search") && (
              <label className="ml-auto flex items-center gap-2">
                Search:
                <span className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search orders" placeholder="Order no, name, phone, product…"
                    className="h-10 w-[280px] rounded-[0.375rem] border border-[#dee2e6] pl-8 pr-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
                </span>
              </label>
            )}
          </div>

          {picked.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm">
              <b className="text-blue-800">{picked.size} selected</b>
              {canDecide && (
                <button type="button" disabled={bulkBusy} onClick={() => bulk("accept")} className="flex h-9 items-center gap-1.5 rounded-[8px] bg-emerald-600 px-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Accept new ones
                </button>
              )}
              {canAssign && (
                <span className="flex items-center gap-1.5">
                  <select value={bulkAgent} onChange={(e) => setBulkAgent(e.target.value)} aria-label="Agent for selected orders" className="h-9 rounded-[8px] border border-blue-200 bg-white pl-2.5 text-sm">
                    <option value="">Choose agent…</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <button type="button" disabled={bulkBusy || !bulkAgent} onClick={() => bulk("assign")} className="flex h-9 items-center gap-1.5 rounded-[8px] bg-[#2563eb] px-3 font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"><Truck className="h-4 w-4" />Assign &amp; send out</button>
                </span>
              )}
              <button type="button" onClick={() => setPicked(new Set())} className="ml-auto text-[13px] font-medium text-blue-700 hover:underline">Clear</button>
            </div>
          )}

          <div className="overflow-x-auto rounded-[10px] border border-[#eef0f4]" style={{ minHeight: pageSize === 0 ? undefined : HEAD_H + Math.min(pageSize, MIN_ROWS) * ROW_H }}>
            <table className="w-full min-w-[1300px] table-fixed border-collapse text-[15px]">
              <colgroup>{cols.map((x) => <col key={x.key} className={x.w} />)}</colgroup>
              <thead>
                <tr className="bg-[#f8f9fb] text-left text-[13px] font-semibold uppercase tracking-wide text-admin-gray-500" style={{ height: HEAD_H }}>
                  {show("or2-c-select") && canEdit && (
                    <th className={td}>
                      <input type="checkbox" aria-label="Select all on this page" className="h-4 w-4 accent-[#2563eb]"
                        checked={pageRows.length > 0 && pageRows.every((r) => picked.has(r.id))}
                        onChange={(e) => setPicked((p) => { const n = new Set(p); pageRows.forEach((r) => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n; })} />
                    </th>
                  )}
                  {show("or2-c-order") && <SortTh label="Order" active={sort.key === "created" ? sort.dir : null} onClick={() => toggleSort("created")} />}
                  {show("or2-c-customer") && <SortTh label="Customer" active={sort.key === "customer" ? sort.dir : null} onClick={() => toggleSort("customer")} />}
                  {show("or2-c-items") && <th className={td}>Items</th>}
                  {show("or2-c-total") && <SortTh label="Total" active={sort.key === "total" ? sort.dir : null} onClick={() => toggleSort("total")} />}
                  {show("or2-c-payment") && <th className={td}>Payment</th>}
                  {show("or2-c-status") && <SortTh label="Status" active={sort.key === "status" ? sort.dir : null} onClick={() => toggleSort("status")} />}
                  {show("or2-c-agent") && canAssign && <th className={td}>Delivery agent</th>}
                  {show("or2-c-actions") && <th className={td}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={cols.length || 1} className={cn(td, "py-12 text-center text-admin-gray-500")}>
                      {rows.length === 0 ? `No ${data.type ? data.type.toLowerCase() + " " : ""}orders in these dates.` : "No orders match these filters."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => {
                    const isBusy = busy.has(r.id);
                    return (
                      <tr key={r.id} style={{ height: ROW_H }} className={cn("bg-white transition-colors hover:bg-[#f8f9fe]", picked.has(r.id) && "bg-blue-50/60", r.orderStatus === "Pending" && "shadow-[inset_3px_0_0_#f6c23e]", isBusy && "opacity-60")}>
                        {show("or2-c-select") && canEdit && (
                          <td className={td}>
                            <input type="checkbox" aria-label={`Select ${r.orderNumber}`} className="h-4 w-4 accent-[#2563eb]" checked={picked.has(r.id)}
                              onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
                          </td>
                        )}
                        {show("or2-c-order") && (
                          <td className={td}>
                            <Link href={`/admin/ecommerce/orders/${r.id}`} className="block truncate font-medium text-[#2563eb] hover:underline">{r.orderNumber}</Link>
                            <div className="truncate text-xs text-admin-gray-500">{fmtDateTime(r.createdAt)}</div>
                          </td>
                        )}
                        {show("or2-c-customer") && (
                          <td className={td}>
                            {r.customerId !== null
                              ? <Link href={`/admin/ecommerce/customers/${r.customerId}`} className="block truncate font-medium text-admin-gray-900 hover:text-[#2563eb] hover:underline">{r.customerName}</Link>
                              : <span className="block truncate font-medium text-admin-gray-900">{r.customerName}{r.isGuest ? " (guest)" : ""}</span>}
                            <div className="truncate text-xs text-admin-gray-500">
                              {r.customerPhone ?? r.customerEmail ?? "No contact"}
                            </div>
                            {show("or2-c-contact") && (r.customerPhone || r.mapUrl) && (
                              <div className="mt-1 flex gap-1">
                                {r.customerPhone && <a href={`tel:${r.customerPhone}`} title="Call" className="grid h-6 w-6 place-items-center rounded-[6px] bg-admin-gray-100 text-admin-gray-600 hover:bg-admin-gray-200"><Phone className="h-3 w-3" /></a>}
                                {r.customerPhone && <a href={`https://wa.me/${r.customerPhone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="grid h-6 w-6 place-items-center rounded-[6px] bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><MessageCircle className="h-3 w-3" /></a>}
                                {r.mapUrl && <a href={r.mapUrl} target="_blank" rel="noopener noreferrer" title="Delivery location" className="grid h-6 w-6 place-items-center rounded-[6px] bg-sky-50 text-sky-600 hover:bg-sky-100"><MapPin className="h-3 w-3" /></a>}
                              </div>
                            )}
                          </td>
                        )}
                        {show("or2-c-items") && (
                          <td className={td}>
                            <button type="button" onClick={() => setDetails(r)} className="text-left hover:text-[#2563eb] hover:underline" title="See the items">
                              {r.itemCount} item{r.itemCount === 1 ? "" : "s"}
                            </button>
                            <div className="truncate text-xs text-admin-gray-500" title={r.items.map((i) => i.productName).join(", ")}>
                              {r.items[0]?.productName ?? "—"}
                            </div>
                          </td>
                        )}
                        {show("or2-c-total") && (
                          <td className={cn(td, "whitespace-nowrap")}>
                            <div className="font-semibold text-admin-gray-900">{money(r.total)}</div>
                            {r.dueBalance > PAISA && <div className="text-xs font-semibold text-[#dc3545]">{money(r.dueBalance)} due</div>}
                          </td>
                        )}
                        {show("or2-c-payment") && (
                          <td className={td}>
                            {canEdit ? (
                              <StatusPill
                                label={`Change payment status for order ${r.orderNumber}`}
                                value={r.paymentStatus}
                                options={PAYMENT_OPTIONS}
                                disabled={isBusy}
                                onChange={(next) => patch(r, { paymentStatus: next })}
                              />
                            ) : (
                              <StatusBadge variant={paymentStatusVariant(r.paymentStatus)}>{r.paymentStatus}</StatusBadge>
                            )}
                            <div className="mt-0.5 truncate text-xs text-admin-gray-500">{r.paymentMethod}</div>
                          </td>
                        )}
                        {show("or2-c-status") && (
                          <td className={td}>
                            {canEdit ? (
                              <StatusPill
                                label={`Change order status for order ${r.orderNumber}`}
                                value={r.orderStatus}
                                options={orderOptions}
                                disabled={isBusy}
                                onChange={(next) => patch(r, { orderStatus: next })}
                              />
                            ) : (
                              <StatusBadge variant={orderStatusVariant(r.orderStatus)}>{r.orderStatus}</StatusBadge>
                            )}
                            {r.agent && <div className="mt-1 truncate text-xs text-admin-gray-500">🛵 {r.agent}</div>}
                            {canEdit && r.orderStatus === "Pending" && (
                              <div className="mt-1.5">
                                <OrderDecision orderId={r.id} orderNumber={r.orderNumber} onDone={(status, text) => {
                                  setRows((list) => list.map((x) => (x.id === r.id ? { ...x, orderStatus: status } : x)));
                                  setToast({ ok: true, text }); router.refresh();
                                }} />
                              </div>
                            )}
                          </td>
                        )}
                        {show("or2-c-agent") && canAssign && (
                          <td className={td}>
                            {["Delivered", "Canceled"].includes(r.orderStatus)
                              ? <span className="truncate text-sm text-admin-gray-600">{r.agent ?? "—"}</span>
                              : (
                                <select value={r.agentId ?? ""} disabled={isBusy} aria-label={`Delivery agent for ${r.orderNumber}`}
                                  onChange={(e) => assign(r, e.target.value ? Number(e.target.value) : null)}
                                  className={cn("h-9 w-full rounded-[8px] border bg-white pl-2.5 text-sm", r.agentId ? "border-sky-200 text-sky-800" : "border-dashed border-admin-gray-300 text-admin-gray-500")}>
                                  <option value="">{r.agentId ? "Remove agent" : "Assign agent…"}</option>
                                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                              )}
                          </td>
                        )}
                        {show("or2-c-actions") && (
                          <td className={td}>
                            <div className="flex gap-[0.4rem]">
                              <IconAction tone="view" href={`/admin/ecommerce/orders/${r.id}`} title={`View order ${r.orderNumber}`}><Eye /></IconAction>
                              {canBill && <IconAction tone="print" href={`/admin/ecommerce/invoice/${r.id}`} title={`Invoice for ${r.orderNumber}`}><Printer /></IconAction>}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-3 text-[15px] text-admin-gray-800">
            <span>
              {filtered.length === 0 ? "Showing 0 entries" : `Showing ${start + 1} to ${start + pageRows.length} of ${filtered.length} entries`}
              {filtered.length !== rows.length && <span className="text-admin-gray-500"> (filtered from {rows.length} total entries)</span>}
              {filtered.length > 0 && <span className="ml-2">· Value shown: <b>{money(shownValue)}</b></span>}
            </span>
            {pageCount > 1 && <Pager page={cur} pageCount={pageCount} onPage={setPage} label="Order pages" />}
          </div>

          {data.truncated && (
            <p className="mt-3 rounded-[0.375rem] bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This range has more orders than one page can load. The newest {rows.length} are shown — narrow the dates to see the rest.
            </p>
          )}
        </section>
      )}

      {details && <ItemsDialog order={details} onClose={() => setDetails(null)} />}

      {toast && createPortal(
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-[0.5rem] border px-4 py-3 text-sm shadow-lg", toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>,
        document.body
      )}
    </div>
  );
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ───────────────────────── dialog ───────────────────────── */

function ItemsDialog({ order, onClose }: { order: Order2Row; onClose: () => void }) {
  return (
    <Modal title={`${order.orderNumber} — ${order.customerName}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-admin-gray-700">
          <span>Placed: <b className="text-admin-gray-900">{fmtDateTime(order.createdAt)}</b></span>
          <span>Total: <b className="text-admin-gray-900">{money(order.total)}</b></span>
          <span>Paid: <b className="text-emerald-600">{money(order.paid)}</b></span>
          {order.dueBalance > PAISA && <span>Due: <b className="text-[#dc3545]">{money(order.dueBalance)}</b></span>}
        </div>
        <div className="overflow-hidden rounded-[0.5rem] border border-admin-gray-200">
          {order.items.map((i, n) => (
            <div key={`${i.productId}-${n}`} className="flex items-center justify-between gap-3 border-b border-admin-gray-100 px-3.5 py-2.5 text-sm last:border-b-0">
              <span className="min-w-0">
                <span className="block truncate text-admin-gray-900">{i.productName}</span>
                <span className="block text-xs text-admin-gray-500">{i.qty} × {money(i.price)}</span>
              </span>
              <b className="shrink-0 text-admin-gray-900">{money(r2(i.qty * i.price))}</b>
            </div>
          ))}
        </div>
        {order.shippingAddress && <p className="whitespace-pre-line text-xs leading-5 text-admin-gray-500">Ships to: {order.shippingAddress}</p>}
        {order.mapUrl && (
          <a href={order.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
            📍 Open delivery location in Google Maps
          </a>
        )}
        <Link href={`/admin/ecommerce/orders/${order.id}`} className="inline-flex h-10 items-center rounded-[0.375rem] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]">Open full order</Link>
      </div>
    </Modal>
  );
}

/* ───────────────────────── small pieces ───────────────────────── */

function TabButton({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={cn("flex h-10 items-center gap-2 rounded-[0.5rem] px-3.5 text-sm font-medium transition-colors", active ? "bg-[#2563eb] text-white" : "text-admin-gray-700 hover:bg-admin-gray-50")}>
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: active ? "#fff" : dot }} />}
      {label}
      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", active ? "bg-white/20 text-white" : "bg-admin-gray-100 text-admin-gray-700")}>{count}</span>
    </button>
  );
}

function SortTh({ label, active, onClick }: { label: string; active: "asc" | "desc" | null; onClick: () => void }) {
  return (
    <th className={cn(td, "font-bold text-admin-gray-900")} aria-sort={active ? (active === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-2 font-bold">
        {label}
        {active === "asc" ? <ArrowUp className="h-4 w-4 text-admin-gray-600" /> : active === "desc" ? <ArrowDown className="h-4 w-4 text-admin-gray-600" /> : <ChevronsUpDown className="h-4 w-4 text-admin-gray-300" />}
      </button>
    </th>
  );
}

function Card({ icon: Icon, tint, value, label, sub }: {
  icon: React.ComponentType<{ className?: string }>; tint: string; value: string; label: string; sub: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-admin-gray-200 bg-white px-4 py-4 shadow-sm">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", tint)}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0">
        <span className="block truncate text-xl font-bold leading-tight text-admin-gray-900" title={value}>{value}</span>
        <span className="block truncate text-sm text-admin-gray-700">{label}</span>
        <span className="block truncate text-xs text-admin-gray-500">{sub}</span>
      </span>
    </div>
  );
}

function Select({ icon: Icon, label, value, onChange, on, children }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; onChange: (v: string) => void; on: boolean; children: React.ReactNode;
}) {
  return (
    <label className={cn("relative flex h-12 min-w-[190px] flex-1 cursor-pointer items-center gap-2.5 rounded-[0.5rem] border pl-3 pr-9 transition-colors focus-within:ring-2 focus-within:ring-[#2563eb]/15",
      on ? "border-[#2563eb]/40 bg-blue-50/50" : "border-admin-gray-200 bg-white hover:border-admin-gray-300")}>
      <Icon className={cn("h-4 w-4 shrink-0", on ? "text-[#2563eb]" : "text-admin-gray-500")} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs leading-4 text-admin-gray-500">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
          className="w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent text-sm font-medium leading-5 text-admin-gray-900 focus:outline-none">
          {children}
        </select>
      </span>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-500" />
    </label>
  );
}

function RangeBar({ range, type, navigate, pending }: { range: { from: string; to: string }; type: string; navigate: (url: string) => void; pending: boolean }) {
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  useEffect(() => { setFrom(range.from); setTo(range.to); }, [range]);

  const today = istTodayYmd();
  const firstThis = `${today.slice(0, 8)}01`;
  const lastPrev = shiftYmd(firstThis, -1);
  const presets: { key: string; label: string; range: [string, string] }[] = [
    { key: "today", label: "Today", range: [today, today] },
    { key: "yesterday", label: "Yesterday", range: [shiftYmd(today, -1), shiftYmd(today, -1)] },
    { key: "7days", label: "7 Days", range: [shiftYmd(today, -6), today] },
    { key: "this_month", label: "This Month", range: [firstThis, today] },
    { key: "prev_month", label: "Previous Month", range: [`${lastPrev.slice(0, 8)}01`, lastPrev] },
  ];
  const active = presets.find((p) => p.range[0] === range.from && p.range[1] === range.to);
  const showing = active ? active.label : range.from === range.to ? longDate(range.from) : `${longDate(range.from)} – ${longDate(range.to)}`;
  const go = (a: string, b: string) => navigate(`${PAGE_PATH}?${new URLSearchParams({ ...(type ? { type } : {}), from: a, to: b }).toString()}`);
  const canApply = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && !(from === range.from && to === range.to);

  return (
    <section className="rounded-xl border border-admin-gray-200 bg-white px-5 py-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2 text-sm text-admin-gray-700"><CalendarDays className="h-4 w-4 text-admin-gray-500" /> Showing: <b className="text-admin-gray-900">{showing}</b></div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button key={p.key} type="button" disabled={pending} onClick={() => go(p.range[0], p.range[1])} aria-pressed={active?.key === p.key}
              className={cn("h-9 rounded-[0.375rem] px-3 text-sm font-medium transition-colors", active?.key === p.key ? "bg-[#2563eb] text-white" : "border border-admin-gray-200 bg-white text-admin-gray-700 hover:bg-admin-gray-50")}>
              {p.label}
            </button>
          ))}
        </div>
        <form className="ml-auto flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (canApply) go(from, to); }}>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="h-9 rounded-[0.375rem] border border-[#dee2e6] px-2.5 text-sm focus:border-[#86b7fe] focus:outline-none" />
          <span className="text-sm text-admin-gray-500">to</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="h-9 rounded-[0.375rem] border border-[#dee2e6] px-2.5 text-sm focus:border-[#86b7fe] focus:outline-none" />
          <button type="submit" disabled={!canApply || pending} className="flex h-9 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Apply
          </button>
        </form>
      </div>
    </section>
  );
}
