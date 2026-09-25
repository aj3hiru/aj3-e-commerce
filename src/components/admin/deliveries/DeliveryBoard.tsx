"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, CheckCircle2, Clock, IndianRupee, Loader2, MapPin, Package, PackageCheck, Phone, Truck, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliveryCard } from "@/lib/deliveries";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const ago = (iso: string | null) => { if (!iso) return ""; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} m`; };
const CARD = "rounded-[10px] border border-admin-gray-200 bg-white shadow-sm";

interface AgentCol { id: number; name: string; orders: DeliveryCard[]; toCollect: number; deliveredToday: number; cashToday: number }

/** Deliveries board: the day in numbers, orders waiting for an agent (assign in one click), and each agent's current work. */
export function DeliveryBoard({ agents, unassigned, canAssign }: { agents: AgentCol[]; unassigned: DeliveryCard[]; canAssign: boolean }) {
  const router = useRouter();
  const { isVisible, loaded } = useDashboardWidgetPrefs();
  const show = (group: string, key: string) => isVisible(group) && isVisible(key);
  const [busy, setBusy] = useState<number | null>(null);
  const [pick, setPick] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function assign(orderId: number) {
    const agentId = Number(pick[orderId]);
    if (!agentId) return;
    setBusy(orderId);
    const res = await fetch(`/api/ecommerce/orders/${orderId}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", agentId }) }).then((r) => r.json()).catch(() => null);
    setBusy(null);
    setMsg({ ok: !!res?.success, text: res?.message || "Couldn't assign." });
    if (res?.success) router.refresh();
    setTimeout(() => setMsg(null), 3000);
  }

  const onWay = agents.reduce((n, a) => n + a.orders.filter((o) => o.status === "Out for Delivery").length, 0);
  const deliveredToday = agents.reduce((n, a) => n + a.deliveredToday, 0);
  const toCollect = agents.reduce((n, a) => n + a.toCollect, 0);
  const cashToday = agents.reduce((n, a) => n + a.cashToday, 0);
  const busyAgents = agents.filter((a) => a.orders.length > 0).length;

  const stats = [
    { key: "dv-k-waiting", icon: Clock, tone: "bg-amber-50 text-amber-600", value: String(unassigned.length), label: "Waiting for agent" },
    { key: "dv-k-onway", icon: Truck, tone: "bg-sky-50 text-sky-600", value: String(onWay), label: "On the way" },
    { key: "dv-k-delivered", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600", value: String(deliveredToday), label: "Delivered today" },
    { key: "dv-k-collect", icon: Wallet, tone: "bg-red-50 text-red-600", value: money(toCollect), label: "Cash to collect" },
    { key: "dv-k-cash", icon: IndianRupee, tone: "bg-violet-50 text-violet-600", value: money(cashToday), label: "Collected today" },
    { key: "dv-k-agents", icon: Users, tone: "bg-admin-gray-100 text-admin-gray-600", value: `${busyAgents} / ${agents.length}`, label: "Agents busy" },
  ].filter((s) => show("dv-stats", s.key));

  return (
    <div className={cn("space-y-4", !loaded && "invisible")}>
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {stats.map((s) => (
            <div key={s.key} className={cn(CARD, "flex items-center gap-3 px-3.5 py-3")}>
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[8px]", s.tone)}><s.icon className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0"><span className="block truncate text-lg font-bold leading-tight text-admin-gray-900">{s.value}</span><span className="block truncate text-xs text-admin-gray-500">{s.label}</span></span>
            </div>
          ))}
        </div>
      )}

      {isVisible("dv-waiting") && (
        <section className={cn(CARD, "overflow-hidden")}>
          <h3 className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800"><Clock className="h-4 w-4" />Waiting for a delivery agent <span className="rounded-[6px] bg-white px-1.5 text-xs">{unassigned.length}</span></h3>
          {unassigned.length === 0 ? <p className="px-4 py-5 text-sm text-admin-gray-500">All accepted orders have an agent. 👍</p> : (
            <ul className="divide-y divide-admin-gray-100">
              {unassigned.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <Link href={`/admin/ecommerce/orders/${o.id}`} className="font-semibold text-[#2563eb] hover:underline">#{o.number}</Link>
                      {show("dv-waiting", "dv-w-customer") && <span className="text-admin-gray-800">{o.customer}</span>}
                      {show("dv-waiting", "dv-w-amount") && <span className="font-semibold text-admin-gray-900">{money(o.total)}</span>}
                      {show("dv-waiting", "dv-w-payment") && <span className={cn("rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold", o.paymentStatus === "Paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{o.paymentStatus === "Paid" ? "Paid" : `Collect · ${o.paymentName}`}</span>}
                    </div>
                    {show("dv-waiting", "dv-w-address") && <p className="mt-0.5 flex items-start gap-1 truncate text-xs text-admin-gray-500"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{o.address.replace(/\n/g, ", ")}</p>}
                    {show("dv-waiting", "dv-w-items") && o.items && <p className="mt-0.5 flex items-start gap-1 truncate text-xs text-admin-gray-500"><Package className="mt-0.5 h-3 w-3 shrink-0" />{o.items}</p>}
                  </div>
                  {show("dv-waiting", "dv-w-contact") && (
                    <div className="flex gap-1">
                      {o.phone && <a href={`tel:${o.phone}`} title="Call" className="grid h-8 w-8 place-items-center rounded-[8px] bg-admin-gray-100 text-admin-gray-600 hover:bg-admin-gray-200"><Phone className="h-3.5 w-3.5" /></a>}
                      <a href={o.mapUrl ?? o.navUrl} target="_blank" rel="noopener noreferrer" title="Map" className="grid h-8 w-8 place-items-center rounded-[8px] bg-sky-50 text-sky-600 hover:bg-sky-100"><MapPin className="h-3.5 w-3.5" /></a>
                    </div>
                  )}
                  {canAssign && show("dv-waiting", "dv-w-assign") && (agents.length === 0 ? <span className="text-xs text-admin-gray-500">Add a Delivery Agent first</span> : (
                    <div className="flex gap-2">
                      <select value={pick[o.id] ?? ""} onChange={(e) => setPick((p) => ({ ...p, [o.id]: e.target.value }))} aria-label={`Agent for ${o.number}`} className="h-9 rounded-[8px] border border-admin-gray-200 bg-white pl-2.5 text-sm">
                        <option value="">Choose agent…</option>
                        {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.orders.length} active)</option>)}
                      </select>
                      <button type="button" disabled={!pick[o.id] || busy === o.id} onClick={() => assign(o.id)} className="flex h-9 items-center gap-1.5 rounded-[8px] bg-[#2563eb] px-3 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">
                        {busy === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}Send out
                      </button>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isVisible("dv-agents") && (agents.length === 0 ? (
        <div className={cn(CARD, "border-dashed p-8 text-center text-sm text-admin-gray-500")}>
          No delivery agents yet. Go to <Link href="/admin/user-manager" className="font-semibold text-[#2563eb]">Staff &amp; Roles</Link> → Add staff → role <b>Delivery Agent</b>.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => (
            <section key={a.id} className={CARD}>
              <div className="flex items-center gap-3 border-b border-admin-gray-100 px-4 py-3">
                <span className={cn("grid h-10 w-10 place-items-center rounded-full", a.orders.length ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700")}><Bike className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-admin-gray-900">{a.name}</p>
                  {show("dv-agents", "dv-a-summary") && <p className="text-xs text-admin-gray-500">{a.orders.length ? `${a.orders.length} active` : "Free"} · {a.deliveredToday} delivered today</p>}
                </div>
              </div>
              {(show("dv-agents", "dv-a-collect") || show("dv-agents", "dv-a-cash")) && (
                <div className="grid grid-cols-2 gap-2 px-4 py-3 text-center">
                  {show("dv-agents", "dv-a-collect") && <div className="rounded-[8px] bg-amber-50 py-2"><p className="text-sm font-bold text-amber-700">{money(a.toCollect)}</p><p className="text-[11px] text-amber-700/80">to collect</p></div>}
                  {show("dv-agents", "dv-a-cash") && <div className="rounded-[8px] bg-emerald-50 py-2"><p className="text-sm font-bold text-emerald-700">{money(a.cashToday)}</p><p className="text-[11px] text-emerald-700/80">cash today</p></div>}
                </div>
              )}
              {show("dv-agents", "dv-a-orders") && (
                <ul className="divide-y divide-admin-gray-100 px-4 pb-2">
                  {a.orders.length === 0 && <li className="py-3 text-sm text-admin-gray-400">Free — no active deliveries</li>}
                  {a.orders.map((o) => (
                    <li key={o.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/admin/ecommerce/orders/${o.id}`} className="text-sm font-semibold text-[#2563eb] hover:underline">#{o.number}</Link>
                        {show("dv-agents", "dv-a-status") && (
                          <span className={cn("inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11px] font-semibold", o.status === "Out for Delivery" ? "bg-sky-50 text-sky-700" : "bg-admin-gray-100 text-admin-gray-600")}>
                            {o.status === "Out for Delivery" ? <Truck className="h-3 w-3" /> : <PackageCheck className="h-3 w-3" />}{o.status === "Out for Delivery" ? "On the way" : "To pick up"}
                          </span>
                        )}
                      </div>
                      {(show("dv-agents", "dv-a-customer") || show("dv-agents", "dv-a-time")) && (
                        <p className="truncate text-xs text-admin-gray-500">
                          {show("dv-agents", "dv-a-customer") && <>{o.customer} · {money(o.total)} {o.paymentStatus !== "Paid" && <span className="text-amber-600">(collect)</span>}</>}
                          {show("dv-agents", "dv-a-customer") && show("dv-agents", "dv-a-time") && " · "}
                          {show("dv-agents", "dv-a-time") && <>assigned {ago(o.assignedAt)} ago</>}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      ))}
      {msg && <div role="status" className={cn("fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-[8px] px-4 py-2 text-sm font-semibold text-white shadow-lg", msg.ok ? "bg-emerald-600" : "bg-red-600")}>{msg.text}</div>}
    </div>
  );
}
