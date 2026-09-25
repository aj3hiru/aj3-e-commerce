"use client";

import Link from "next/link";
import { Monitor, Smartphone } from "lucide-react";
import { CampaignOffers } from "@/components/shop/home/CampaignBanner";
import { LaptopFrame, PhoneFrame } from "@/components/admin/PhoneFrame";
import { offerLabel as homeOfferLabel, type CampaignBannerData } from "@/types/campaign-home";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BadgeCheck, CalendarDays, CheckCircle2, ChevronDown, Copy, Download, IndianRupee, Info, Layers, Loader2, Pause, Percent,
  Play, Plus, ShoppingCart, SquarePen, Tag, Trash2, X, AlertCircle, Package, PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { campaignState, offerLabel, type CampaignState } from "@/lib/campaign-core";
import type { Campaigns2Data, CampaignRowData, RangeFilters } from "@/lib/campaigns2";
import { CampaignEditor, EMPTY_FORM, formFromCampaign, type CampaignFormState } from "./CampaignEditor";
import { CampaignSalesChart } from "./CampaignSalesChart";
import { durationText, fmtDateTime, money } from "./format";
import { ConfirmDialog, Pager, StatePill, Thumb } from "./ui";
import { IconAction } from "@/components/admin/ui/buttons";

const PAGE_PATH = "/admin/ecommerce/campaign-offer";
const EVT_EXPORT = "campaigns2:export";
const EVT_NEW = "campaigns2:new";

/* ───────────────────────── header buttons ───────────────────────── */

export function Campaigns2HeaderButtons() {
  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_EXPORT))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]">
        <Download className="h-4 w-4" /> Export
      </button>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_NEW))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-blue-600 px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
        <Plus className="h-4 w-4" /> New Campaign
      </button>
    </>
  );
}

/* ───────────────────────── India-time date helpers for the range bar ───────────────────────── */

const istTodayYmd = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
function shiftYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const dmy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const longDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

/* ───────────────────────── body ───────────────────────── */

type Tab = "all" | CampaignState;
const ROW_H = 84;
const HEAD_H = 50;
const MIN_ROWS = 4;
const td = "border border-[#dee2e6] px-3 align-middle";

interface Props {
  data: Campaigns2Data;
  serverNow: string;
  filters: RangeFilters;
  isDefaultRange: boolean;
  notice?: string | null;
}

export function Campaigns2Body({ data, serverNow, filters, isDefaultRange, notice }: Props) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [loading, startLoading] = useTransition();

  // A local copy so a pause / resume / end shows at once; replaced by every fresh server read.
  const [campaigns, setCampaigns] = useState(data.campaigns);
  useEffect(() => setCampaigns(data.campaigns), [data.campaigns]);

  // "Now" drives Live / Scheduled / Ended and the countdowns. It starts from the
  // server's clock (so the first paint matches) and then ticks every 30 seconds.
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [tab, setTab] = useState<Tab>("all");
  const [cq, setCq] = useState("");
  const cSearch = useDeferredValue(cq);
  const [cSize, setCSize] = useState(10);
  const [cPage, setCPage] = useState(1);
  const [pq, setPq] = useState("");
  const pSearch = useDeferredValue(pq);
  const [pSize, setPSize] = useState(10);
  const [pPage, setPPage] = useState(1);

  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [editor, setEditor] = useState<{ editing: CampaignRowData | null; initial: CampaignFormState } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "end" | "delete"; c: CampaignRowData } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(notice ? { ok: true, text: notice } : null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const stateOf = useCallback((c: CampaignRowData) => campaignState({ isPaused: c.isPaused, startsAt: c.startsAt ? new Date(c.startsAt) : null, endsAt: c.endsAt ? new Date(c.endsAt) : null }, now), [now]);

  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);
  const categoryById = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data.categories]);
  const brandById = useMemo(() => new Map(data.brands.map((b) => [b.id, b.name])), [data.brands]);
  const campaignById = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);

  const counts = useMemo(() => {
    const n = { all: campaigns.length, live: 0, scheduled: 0, paused: 0, ended: 0 };
    for (const c of campaigns) n[stateOf(c)]++;
    return n;
  }, [campaigns, stateOf]);

  // Products on offer: the server worked these out; drop any whose campaign has since stopped.
  const offers = useMemo(() => data.offers.filter((o) => {
    const c = campaignById.get(o.campaignId);
    return !!c && stateOf(c) === "live";
  }), [data.offers, campaignById, stateOf]);

  const appliesTo = useCallback((c: CampaignRowData): { title: string; names: string } => {
    if (c.scope === "all") return { title: "All products", names: "Every active product" };
    const pick = (map: Map<number, string | { name: string }>, type: CampaignRowData["targets"][number]["type"]) =>
      c.targets.filter((t) => t.type === type).map((t) => { const v = map.get(t.id); return typeof v === "string" ? v : v?.name ?? "(removed)"; });
    const names = c.scope === "category" ? pick(categoryById, "category") : c.scope === "brand" ? pick(brandById, "brand") : pick(productById, "product");
    const noun = c.scope === "category" ? "categor" : c.scope === "brand" ? "brand" : "product";
    const title = `${names.length} ${noun}${c.scope === "category" ? (names.length === 1 ? "y" : "ies") : names.length === 1 ? "" : "s"}`;
    return { title, names: names.join(", ") };
  }, [categoryById, brandById, productById]);

  /* ── the Campaigns table ── */
  const cFiltered = useMemo(() => {
    const term = cSearch.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (tab !== "all" && stateOf(c) !== tab) return false;
      if (!term) return true;
      const a = appliesTo(c);
      return `${c.name} ${a.title} ${a.names} ${offerLabel(c)}`.toLowerCase().includes(term);
    });
  }, [campaigns, tab, cSearch, stateOf, appliesTo]);
  useEffect(() => setCPage(1), [tab, cSearch, cSize]);
  const cPages = cSize === 0 ? 1 : Math.max(1, Math.ceil(cFiltered.length / cSize));
  const cCur = Math.min(cPage, cPages);
  const cStart = cSize === 0 ? 0 : (cCur - 1) * cSize;
  const cRows = cSize === 0 ? cFiltered : cFiltered.slice(cStart, cStart + cSize);

  /* ── the Products on Offer table ── */
  const pFiltered = useMemo(() => {
    const term = pSearch.trim().toLowerCase();
    return offers.filter((o) => {
      const p = productById.get(o.productId);
      if (!p) return false;
      return !term || `${p.name} ${o.campaignName}`.toLowerCase().includes(term);
    });
  }, [offers, pSearch, productById]);
  useEffect(() => setPPage(1), [pSearch, pSize]);
  const pPages = pSize === 0 ? 1 : Math.max(1, Math.ceil(pFiltered.length / pSize));
  const pCur = Math.min(pPage, pPages);
  const pStart = pSize === 0 ? 0 : (pCur - 1) * pSize;
  const pRows = pSize === 0 ? pFiltered : pFiltered.slice(pStart, pStart + pSize);

  /* ── actions ── */
  const markBusy = (id: number, on: boolean) => setBusy((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  async function quick(c: CampaignRowData, action: "pause" | "resume" | "end") {
    markBusy(c.id, true);
    try {
      const res = await fetch(`/api/ecommerce/campaigns2/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; endsAt?: string };
      if (!res.ok || d.success !== true) {
        setToast({ ok: false, text: d.message || "Could not update the campaign. Please try again." });
        return;
      }
      // "End now" is shown as ended straight away (a second earlier than the server's clock, so
      // this browser's slightly different clock can't keep it "Live"); the refresh below brings the exact time.
      setNow(new Date());
      setCampaigns((list) => list.map((x) => (x.id !== c.id ? x : action === "end" ? { ...x, endsAt: new Date(Date.now() - 1000).toISOString() } : { ...x, isPaused: action === "pause" })));
      setToast({ ok: true, text: `“${c.name}” ${action === "pause" ? "paused" : action === "resume" ? "resumed" : "ended"}.` });
      router.refresh();
    } catch {
      setToast({ ok: false, text: "Could not reach the server. Please try again." });
    } finally {
      markBusy(c.id, false);
      setConfirm(null);
    }
  }

  async function remove(c: CampaignRowData) {
    markBusy(c.id, true);
    try {
      const res = await fetch(`/api/ecommerce/campaigns2/${c.id}`, { method: "DELETE" });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || d.success !== true) {
        setToast({ ok: false, text: d.message || "Could not delete the campaign. Please try again." });
        return;
      }
      setCampaigns((list) => list.filter((x) => x.id !== c.id));
      setToast({ ok: true, text: `“${c.name}” deleted.` });
      router.refresh();
    } catch {
      setToast({ ok: false, text: "Could not reach the server. Please try again." });
    } finally {
      markBusy(c.id, false);
      setConfirm(null);
    }
  }

  const openNew = useCallback(() => setEditor({ editing: null, initial: EMPTY_FORM }), []);
  const duplicate = (c: CampaignRowData) =>
    setEditor({ editing: null, initial: { ...formFromCampaign(c), name: `${c.name} (copy)`, startMode: "now", startAt: "", endMode: "none", endAt: "", paused: false } });

  function exportCsv() {
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["ID", "Name", "Applies to", "Offer", "Starts", "Ends", "Status", "Orders", "Units sold", "Sales", "Discount given"].join(",")];
    for (const c of campaigns) {
      const a = appliesTo(c);
      lines.push([
        c.id, c.name, `${a.title}${c.scope === "all" ? "" : `: ${a.names}`}`, offerLabel(c),
        c.startsAt ? fmtDateTime(c.startsAt) : fmtDateTime(c.createdAt), c.endsAt ? fmtDateTime(c.endsAt) : "No end date",
        stateOf(c), c.stats.orders, c.stats.units, c.stats.revenue.toFixed(2), c.stats.discount.toFixed(2),
      ].map(cell).join(","));
    }
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Header buttons talk to the body through events.
  const exportRef = useRef(exportCsv);
  exportRef.current = exportCsv;
  useEffect(() => {
    const onExport = () => (campaigns.length ? exportRef.current() : setToast({ ok: false, text: "There are no campaigns to export yet." }));
    window.addEventListener(EVT_EXPORT, onExport);
    window.addEventListener(EVT_NEW, openNew);
    return () => {
      window.removeEventListener(EVT_EXPORT, onExport);
      window.removeEventListener(EVT_NEW, openNew);
    };
  }, [campaigns.length, openNew]);

  const navigate = (url: string) => startLoading(() => router.push(url, { scroll: false }));
  const dim = cn("transition-opacity duration-150", loading && "pointer-events-none opacity-50");

  if (!data.ready) return <SetupNeeded />;

  const showChart = show("co2-chart");
  const showMetrics = show("co2-metrics");
  const activeProducts = data.products.filter((p) => p.status === "active").length;

  return (
    // Invisible (space kept) until the saved Display Options are read, so hidden parts never flash in.
    <div className={cn("grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]", !loaded && "invisible")}>
    <div className="relative min-w-0 space-y-5" aria-busy={loading}>
      {data.legacyCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-[13px] leading-5 text-admin-gray-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p>
            {data.legacyCount} product{data.legacyCount === 1 ? " is" : "s are"} still in the old <Link href="/admin/ecommerce/campaign-offer" className="font-medium text-[#2563eb] hover:underline">Campaign Offer</Link> list.
            That list&apos;s &ldquo;campaign price&rdquo; is not applied in the shop or at billing, so it doesn&apos;t change any price. Create a campaign here to run an offer that does.
          </p>
        </div>
      )}

      {show("co2-range") && <RangeBar filters={filters} navigate={navigate} pending={loading} />}

      {(showChart || showMetrics) && (
        <div className={cn("grid grid-cols-1 gap-5", dim, showChart && showMetrics && "min-[1600px]:grid-cols-[minmax(0,1fr)_minmax(0,1.18fr)]")}>
          {showChart && <CampaignSalesChart points={data.chart.points} granularity={data.chart.granularity} />}
          {showMetrics && (
            <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2.5 text-base font-semibold text-admin-gray-900"><Tag className="h-5 w-5 text-emerald-600" /> Key Metrics</h2>
                <div className="flex items-center gap-2 rounded-lg bg-admin-gray-50 px-3 py-1.5 text-[13px] text-admin-gray-700">
                  <CalendarDays className="h-3.5 w-3.5 text-admin-gray-500" /> {dmy(filters.from)} <ArrowRight className="h-3.5 w-3.5 text-admin-gray-400" /> {dmy(filters.to)}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {show("co2-m-live") && <Tile icon={BadgeCheck} tone="green" label="Active Campaigns" value={String(counts.live)} sub={counts.scheduled > 0 ? `${counts.scheduled} scheduled` : "None scheduled"} />}
                {show("co2-m-products") && <Tile icon={Package} tone="blue" label="Products on Offer" value={String(offers.length)} sub={`of ${activeProducts} active products`} />}
                {show("co2-m-sales") && <Tile icon={IndianRupee} tone="green" label="Campaign Sales" value={money(data.range.revenue)} sub={isDefaultRange ? "This month" : "Selected range"} />}
                {show("co2-m-units") && <Tile icon={Layers} tone="navy" label="Units Sold" value={data.range.units.toLocaleString("en-IN")} sub="at a campaign price" />}
                {show("co2-m-discount") && <Tile icon={Percent} tone="amber" label="Discount Given" value={money(data.range.discount)} sub="off the usual price" />}
                {show("co2-m-orders") && <Tile icon={ShoppingCart} tone="blue" label="Orders with Offer" value={data.range.orders.toLocaleString("en-IN")} sub="completed sales" />}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Campaigns & history ── */}
      {show("co2-campaigns") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-admin-gray-900">Campaigns</h2>
            <div className="inline-flex flex-wrap gap-1 rounded-[0.5rem] border border-admin-gray-200 bg-admin-gray-50 p-1" role="tablist" aria-label="Campaign status">
              {([["all", "All"], ["live", "Live"], ["scheduled", "Scheduled"], ["paused", "Paused"], ["ended", "History"]] as [Tab, string][]).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={cn("rounded-[0.375rem] px-3 py-1.5 text-sm font-medium transition-colors", tab === k ? "bg-white text-[#2563eb] shadow-sm" : "text-admin-gray-600 hover:text-admin-gray-900")}>
                  {label} <span className={cn("ml-1 text-xs", tab === k ? "text-[#2563eb]" : "text-admin-gray-400")}>{counts[k]}</span>
                </button>
              ))}
            </div>
          </div>

          <TableToolbar size={cSize} onSize={setCSize} search={show("co2-c-search") ? { value: cq, onChange: setCq, label: "Search campaigns" } : null} />

          <div className="overflow-x-auto" style={{ minHeight: cSize === 0 ? undefined : HEAD_H + Math.min(cSize, MIN_ROWS) * ROW_H }}>
            <table className="w-full min-w-[980px] table-fixed border-collapse text-[15px]">
              <colgroup>
                <col />
                {show("co2-c-applies") && <col className="w-[190px] min-[1500px]:w-[230px]" />}
                {show("co2-c-offer") && <col className="w-[110px]" />}
                {show("co2-c-schedule") && <col className="w-[250px] min-[1500px]:w-[280px]" />}
                {show("co2-c-status") && <col className="w-[130px]" />}
                {show("co2-c-sales") && <col className="w-[150px]" />}
                {show("co2-c-actions") && <col className="w-[196px]" />}
              </colgroup>
              <thead>
                <tr className="bg-[#f8f9fa] text-left font-bold text-admin-gray-900" style={{ height: HEAD_H }}>
                  <th className={td}>Campaign</th>
                  {show("co2-c-applies") && <th className={td}>Applies To</th>}
                  {show("co2-c-offer") && <th className={td}>Offer</th>}
                  {show("co2-c-schedule") && <th className={td}>Schedule</th>}
                  {show("co2-c-status") && <th className={td}>Status</th>}
                  {show("co2-c-sales") && <th className={td}>Sales</th>}
                  {show("co2-c-actions") && <th className={td}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {cRows.length === 0 ? (
                  <tr>
                    <td colSpan={1 + ["co2-c-applies", "co2-c-offer", "co2-c-schedule", "co2-c-status", "co2-c-sales", "co2-c-actions"].filter(show).length} className={cn(td, "py-12 text-center text-admin-gray-500")}>
                      {campaigns.length === 0 ? (
                        <span className="inline-flex flex-col items-center gap-3">
                          <span>No campaigns yet. Create one to offer a discount for a period of time.</span>
                          <button type="button" onClick={openNew} className="flex h-10 items-center gap-2 rounded-[0.5rem] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> New Campaign</button>
                        </span>
                      ) : "No campaigns match this view."}
                    </td>
                  </tr>
                ) : (
                  cRows.map((c) => {
                    const st = stateOf(c);
                    const a = appliesTo(c);
                    const isBusy = busy.has(c.id);
                    const hasSales = c.stats.orders > 0;
                    return (
                      <tr key={c.id} style={{ height: ROW_H }} className={cn("odd:bg-[#f2f2f2] even:bg-white", isBusy && "opacity-60")}>
                        <td className={td}>
                          <button type="button" onClick={() => setEditor({ editing: c, initial: formFromCampaign(c) })} title={`Edit ${c.name}`}
                            className="block max-w-full truncate text-left font-medium text-admin-gray-900 hover:text-[#2563eb] hover:underline">{c.name}</button>
                          <div className="truncate text-xs text-admin-gray-500">Created {fmtDateTime(c.createdAt)}</div>
                        </td>
                        {show("co2-c-applies") && (
                          <td className={td}>
                            <div className="truncate">{a.title}</div>
                            <div className="truncate text-xs text-admin-gray-500" title={a.names}>{c.scope === "all" ? "Every active product" : a.names}</div>
                          </td>
                        )}
                        {show("co2-c-offer") && <td className={cn(td, "whitespace-nowrap font-semibold text-admin-gray-900")}>{offerLabel(c)}</td>}
                        {show("co2-c-schedule") && (
                          <td className={cn(td, "text-[13px] leading-5")}>
                            <div className="truncate">From {fmtDateTime(c.startsAt ?? c.createdAt)}</div>
                            <div className="truncate">{c.endsAt ? `Until ${fmtDateTime(c.endsAt)}` : "No end date"}</div>
                            <Countdown c={c} state={st} now={now} />
                          </td>
                        )}
                        {show("co2-c-status") && <td className={td}><StatePill state={st} /></td>}
                        {show("co2-c-sales") && (
                          <td className={td}>
                            <div className="font-semibold text-admin-gray-900">{money(c.stats.revenue)}</div>
                            <div className="text-xs text-admin-gray-500">{c.stats.units} unit{c.stats.units === 1 ? "" : "s"} · {c.stats.orders} order{c.stats.orders === 1 ? "" : "s"}</div>
                          </td>
                        )}
                        {show("co2-c-actions") && (
                          <td className={td}>
                            <div className="flex gap-[0.4rem]">
                              <IconAction tone="edit" title={`Edit ${c.name}`} onClick={() => setEditor({ editing: c, initial: formFromCampaign(c) })}><SquarePen /></IconAction>
                              {st !== "ended" && (c.isPaused
                                ? <IconAction tone="add" title={`Resume ${c.name}`} disabled={isBusy} onClick={() => quick(c, "resume")}><Play /></IconAction>
                                : <IconAction tone="warn" title={`Pause ${c.name}`} disabled={isBusy} onClick={() => quick(c, "pause")}><Pause /></IconAction>)}
                              <IconAction tone="print" title={`Duplicate ${c.name}`} onClick={() => duplicate(c)}><Copy /></IconAction>
                              {st !== "ended"
                                ? <IconAction tone="delete" title={`End ${c.name} now`} disabled={isBusy} onClick={() => setConfirm({ kind: "end", c })}><X /></IconAction>
                                : <IconAction tone="delete" title={hasSales ? "Kept in history — it has sales" : `Delete ${c.name}`} disabled={isBusy || hasSales} onClick={() => setConfirm({ kind: "delete", c })}><Trash2 /></IconAction>}
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

          <TableFooter start={cStart} shown={cRows.length} total={cFiltered.length} all={campaigns.length} pages={cPages} page={cCur} onPage={setCPage} label="Campaign pages" />
        </section>
      )}

      {/* ── Products on Offer: the "sheet" from the old Campaign Offer page ── */}
      {show("co2-offers") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="mb-4 text-xl font-semibold text-admin-gray-900">Products on Offer <span className="ml-1 text-base font-normal text-admin-gray-500">right now</span></h2>
          <TableToolbar size={pSize} onSize={setPSize} search={show("co2-p-search") ? { value: pq, onChange: setPq, label: "Search products on offer" } : null} />

          <div className="overflow-x-auto" style={{ minHeight: pSize === 0 ? undefined : HEAD_H + Math.min(pSize, MIN_ROWS) * 76 }}>
            <table className="w-full min-w-[820px] table-fixed border-collapse text-[15px]">
              <colgroup>
                {show("co2-p-image") && <col className="w-[88px] min-[1500px]:w-[110px]" />}
                <col />
                {show("co2-p-price") && <col className="w-[210px]" />}
                {show("co2-p-campaign") && <col className="w-[220px]" />}
                {show("co2-p-ends") && <col className="w-[160px]" />}
                {show("co2-p-actions") && <col className="w-[116px]" />}
              </colgroup>
              <thead>
                <tr className="bg-[#f8f9fa] text-left font-bold text-admin-gray-900" style={{ height: HEAD_H }}>
                  {show("co2-p-image") && <th className={td}>Image</th>}
                  <th className={td}>Name</th>
                  {show("co2-p-price") && <th className={td}>Price</th>}
                  {show("co2-p-campaign") && <th className={td}>Campaign</th>}
                  {show("co2-p-ends") && <th className={td}>Ends</th>}
                  {show("co2-p-actions") && <th className={td}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pRows.length === 0 ? (
                  <tr>
                    <td colSpan={1 + ["co2-p-image", "co2-p-price", "co2-p-campaign", "co2-p-ends", "co2-p-actions"].filter(show).length} className={cn(td, "py-12 text-center text-admin-gray-500")}>
                      {offers.length === 0 ? (
                        <span className="inline-flex items-center gap-2"><PartyPopper className="h-5 w-5 text-admin-gray-400" /> No product has a campaign price right now.</span>
                      ) : "No products match your search."}
                    </td>
                  </tr>
                ) : (
                  pRows.map((o) => {
                    const p = productById.get(o.productId);
                    const c = campaignById.get(o.campaignId);
                    if (!p) return null;
                    const pct = p.price > 0 ? Math.round(((p.price - o.unitPrice) / p.price) * 100) : 0;
                    return (
                      <tr key={o.productId} style={{ height: 76 }} className="odd:bg-[#f2f2f2] even:bg-white">
                        {show("co2-p-image") && <td className={td}><Thumb src={p.image} name={p.name} size={52} /></td>}
                        <td className={td}>
                          <Link href={`/admin/ecommerce/products/add?edit=${p.id}`} title={`Edit ${p.name}`} className="block max-w-full truncate text-admin-gray-900 hover:text-[#2563eb] hover:underline">{p.name}</Link>
                        </td>
                        {show("co2-p-price") && (
                          <td className={cn(td, "whitespace-nowrap")}>
                            <span className="text-admin-gray-500 line-through">{money(p.price)}</span>{" "}
                            <span className="text-lg font-bold text-[#dc3545]">{money(o.unitPrice)}</span>
                            {pct > 0 && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{pct}% off</span>}
                          </td>
                        )}
                        {show("co2-p-campaign") && (
                          <td className={td}>
                            <div className="truncate font-medium text-admin-gray-800" title={o.campaignName}>{o.campaignName}</div>
                            {c && <div className="text-xs text-admin-gray-500">{offerLabel(c)}</div>}
                          </td>
                        )}
                        {show("co2-p-ends") && (
                          <td className={cn(td, "text-[13px] leading-5")}>
                            {c?.endsAt ? (<><div>{fmtDateTime(c.endsAt)}</div><div className="text-xs text-amber-600">in {durationText(new Date(c.endsAt).getTime() - now.getTime())}</div></>) : <span className="text-admin-gray-500">No end date</span>}
                          </td>
                        )}
                        {show("co2-p-actions") && (
                          <td className={td}>
                            <div className="flex gap-[0.4rem]">
                              <IconAction tone="edit" href={`/admin/ecommerce/products/add?edit=${p.id}`} title={`Edit ${p.name}`}><SquarePen /></IconAction>
                              {c && <IconAction tone="view" title={`Open campaign ${c.name}`} onClick={() => setEditor({ editing: c, initial: formFromCampaign(c) })}><Tag /></IconAction>}
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

          <TableFooter start={pStart} shown={pRows.length} total={pFiltered.length} all={offers.length} pages={pPages} page={pCur} onPage={setPPage} label="Products on offer pages" />
        </section>
      )}

      {editor && (
        <CampaignEditor
          key={editor.editing?.id ?? "new"}
          editing={editor.editing}
          initial={editor.initial}
          products={data.products}
          categories={data.categories}
          brands={data.brands}
          onClose={() => setEditor(null)}
          onSaved={(message) => { setEditor(null); setToast({ ok: true, text: message }); router.refresh(); }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          danger
          busy={busy.has(confirm.c.id)}
          title={confirm.kind === "end" ? "End this campaign now?" : "Delete this campaign?"}
          confirmLabel={confirm.kind === "end" ? "End now" : "Delete"}
          onClose={() => setConfirm(null)}
          onConfirm={() => (confirm.kind === "end" ? quick(confirm.c, "end") : remove(confirm.c))}
          body={confirm.kind === "end"
            ? <>“{confirm.c.name}” stops right away and prices go back to normal. It stays in the History with its sales, and you can run it again by editing it and setting a new end time.</>
            : <>“{confirm.c.name}” has no sales, so it will be removed completely. This can&apos;t be undone.</>}
        />
      )}

      {toast && createPortal(
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-[0.5rem] border px-4 py-3 text-sm shadow-lg", toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>,
        document.body
      )}
    </div>
    <HomeOffersPreview campaigns={data.campaigns} now={now} categoryById={categoryById} brandById={brandById} productById={productById} />
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Countdown({ c, state, now }: { c: CampaignRowData; state: CampaignState; now: Date }) {
  if (state === "live" && c.endsAt) return <div className="truncate text-xs font-medium text-amber-600">Ends in {durationText(new Date(c.endsAt).getTime() - now.getTime())}</div>;
  if (state === "live") return <div className="text-xs font-medium text-emerald-600">Running</div>;
  if (state === "scheduled" && c.startsAt) return <div className="truncate text-xs font-medium text-[#4361ee]">Starts in {durationText(new Date(c.startsAt).getTime() - now.getTime())}</div>;
  if (state === "paused") return <div className="text-xs font-medium text-amber-600">On hold — resume to apply</div>;
  return <div className="text-xs text-admin-gray-500">Finished</div>;
}

function TableToolbar({ size, onSize, search }: { size: number; onSize: (n: number) => void; search: { value: string; onChange: (v: string) => void; label: string } | null }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-[15px] text-admin-gray-900">
      <label className="flex items-center gap-2">
        Show
        <span className="relative">
          <select value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label="Entries per page"
            className="h-10 w-[90px] appearance-none rounded-[0.375rem] border border-[#dee2e6] bg-white pl-3 pr-8 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            <option value={0}>All</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-600" />
        </span>
        entries
      </label>
      {search && (
        <label className="ml-auto flex items-center gap-2">
          Search:
          <input type="search" value={search.value} onChange={(e) => search.onChange(e.target.value)} aria-label={search.label}
            className="h-10 w-[220px] rounded-[0.375rem] border border-[#dee2e6] px-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
        </label>
      )}
    </div>
  );
}

function TableFooter({ start, shown, total, all, pages, page, onPage, label }: { start: number; shown: number; total: number; all: number; pages: number; page: number; onPage: (p: number) => void; label: string }) {
  return (
    <div className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-3 text-[15px] text-admin-gray-800">
      <span>
        {total === 0 ? "Showing 0 entries" : `Showing ${start + 1} to ${start + shown} of ${total} entries`}
        {total !== all && <span className="text-admin-gray-500"> (filtered from {all} total entries)</span>}
      </span>
      {pages > 1 && <Pager page={page} pageCount={pages} onPage={onPage} label={label} />}
    </div>
  );
}

const TONES = {
  green: { bg: "bg-emerald-600", text: "text-emerald-600" },
  blue: { bg: "bg-blue-600", text: "text-blue-600" },
  navy: { bg: "bg-blue-600", text: "text-slate-800" },
  amber: { bg: "bg-amber-400", text: "text-amber-500" },
} as const;

function Tile({ icon: Icon, tone, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; tone: keyof typeof TONES; label: string; value: string; sub: string }) {
  return (
    <div className="flex h-full gap-2.5 rounded-xl border border-admin-gray-100 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white", TONES[tone].bg)}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs leading-5 text-admin-gray-700" title={label}>{label}</div>
        <div className={cn("whitespace-nowrap text-xl font-bold leading-8 tracking-tight", TONES[tone].text)}>{value}</div>
        <div className="truncate text-xs leading-5 text-admin-gray-500">{sub}</div>
      </div>
    </div>
  );
}

/** Showing: <range>  [Today|Yesterday|7 Days|This Month|Previous Month]  [from] to [to] [Apply] */
function RangeBar({ filters, navigate, pending }: { filters: RangeFilters; navigate: (url: string) => void; pending: boolean }) {
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  useEffect(() => { setFrom(filters.from); setTo(filters.to); }, [filters]);

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
  const active = presets.find((p) => p.range[0] === filters.from && p.range[1] === filters.to);
  const showing = active ? active.label : filters.from === filters.to ? longDate(filters.from) : `${longDate(filters.from)} – ${longDate(filters.to)}`;
  const go = (a: string, b: string) => navigate(`${PAGE_PATH}?from=${a}&to=${b}`);
  const canApply = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && !(from === filters.from && to === filters.to);

  return (
    <section className="rounded-xl border border-admin-gray-200 bg-white px-5 py-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="text-sm text-admin-gray-700">Showing: <b className="text-admin-gray-900">{showing}</b></div>
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

/** Shown instead of the page until the three campaign tables exist in the database. */
function SetupNeeded() {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 text-sm leading-6 text-admin-gray-800">
      <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-admin-gray-900"><AlertCircle className="h-5 w-5 text-amber-600" /> One setup step is left</h2>
      <p>Campaigns need three new database tables, and they aren&apos;t there yet. Nothing else on the site is affected — prices and orders carry on as normal. On the server, in the project folder, run:</p>
      <pre className="my-3 overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-[13px] text-slate-100">npx prisma db push</pre>
      <p>then build and restart as usual, and reload this page.</p>
    </section>
  );
}

/** Right-hand card: what shoppers see on the homepage right now (running campaigns with "Show on homepage"). */
function HomeOffersPreview({ campaigns, now, categoryById, brandById, productById }: {
  campaigns: CampaignRowData[]; now: Date; categoryById: Map<number, string>; brandById: Map<number, string>; productById: Map<number, { name: string }>;
}) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const t = now.getTime();
  const items: CampaignBannerData[] = campaigns
    .filter((c) => c.home.show && !c.isPaused && (!c.startsAt || new Date(c.startsAt).getTime() <= t) && (!c.endsAt || new Date(c.endsAt).getTime() > t))
    .slice(0, 6)
    .map((c) => {
      const names = c.targets.map((x) => (x.type === "category" ? categoryById.get(x.id) : x.type === "brand" ? brandById.get(x.id) : productById.get(x.id)?.name)).filter(Boolean) as string[];
      const noun = c.scope === "category" ? "categories" : c.scope === "brand" ? "brands" : "products";
      return {
        id: c.id, home: c.home, name: c.name, offer: homeOfferLabel(c.discountType, c.discountValue),
        appliesTo: c.scope === "all" ? "on everything" : names.length === 1 ? `on ${names[0]}` : `on ${names.length} ${noun}`,
        endsAt: c.endsAt, href: "#",
      };
    });
  const page = (
    <div className="h-full overflow-hidden bg-white font-storefront" style={{ ["--hp-accent" as string]: "#9f2089" }} onClickCapture={(e) => { if ((e.target as HTMLElement).closest("a")) e.preventDefault(); }}>
      <div className="flex items-center justify-between border-b border-[#eaeaf2] px-3 py-2.5"><span className="h-3 w-24 rounded bg-[#e8d3e4]" /><span className="h-3 w-14 rounded bg-[#ececf2]" /></div>
      <div className="mx-3 mt-3 h-14 rounded-[8px] bg-[#f3f3f7]" />
      {items.length > 0
        ? <CampaignOffers items={items} />
        : <div className="m-3 rounded-[8px] border border-dashed border-[#cfcedc] px-3 py-4 text-center text-[12px] text-[#8b8ba3]">No running campaign is set to “Show on homepage”.</div>}
      <p className="px-3 text-[15px] font-semibold text-[#353543]">Products For You</p>
      <div className="grid grid-cols-2 gap-2 p-3">{[0, 1, 2, 3].map((i) => <span key={i} className="aspect-square rounded-[6px] bg-[#f3f3f7]" />)}</div>
    </div>
  );
  return (
    <aside className="rounded-[10px] border border-admin-gray-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-admin-gray-900">On your homepage</p>
          <p className="text-[12px] text-admin-gray-500">{items.length === 0 ? "Nothing showing" : `${items.length} offer${items.length === 1 ? "" : "s"}${items.length > 1 ? " · slider" : ""}`}</p>
        </div>
        <div className="inline-flex rounded-[8px] bg-admin-gray-100 p-1">
          {([["mobile", Smartphone], ["desktop", Monitor]] as const).map(([d, Icon]) => (
            <button key={d} type="button" onClick={() => setDevice(d)} aria-label={`${d} preview`} aria-pressed={device === d}
              className={cn("grid h-7 w-8 place-items-center rounded-[6px]", device === d ? "bg-white text-[#2563eb] shadow-sm" : "text-admin-gray-500")}><Icon className="h-4 w-4" /></button>
          ))}
        </div>
      </div>
      <div className="flex justify-center rounded-[10px] bg-[linear-gradient(180deg,#f7f7fa,#ececf2)] p-3">
        {device === "mobile" ? <PhoneFrame width={250}>{page}</PhoneFrame> : <LaptopFrame fluid>{page}</LaptopFrame>}
      </div>
    </aside>
  );
}
