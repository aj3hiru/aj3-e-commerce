"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, Clock, Loader2, MapPin, PackageCheck, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliveryCard } from "@/lib/deliveries";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const ago = (iso: string | null) => { if (!iso) return ""; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} m`; };

interface AgentCol { id: number; name: string; orders: DeliveryCard[]; toCollect: number; deliveredToday: number; cashToday: number }

/** Deliveries board: orders waiting for an agent (assign in one click) and each agent's current work. */
export function DeliveryBoard({ agents, unassigned, canAssign }: { agents: AgentCol[]; unassigned: DeliveryCard[]; canAssign: boolean }) {
  const router = useRouter();
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

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-amber-200 bg-white shadow-sm">
        <h3 className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"><Clock className="h-4 w-4" />Waiting for a delivery agent ({unassigned.length})</h3>
        {unassigned.length === 0 ? <p className="px-4 py-4 text-sm text-admin-gray-500">All accepted orders have an agent. 👍</p> : (
          <ul className="divide-y divide-admin-gray-100">
            {unassigned.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[200px] flex-1">
                  <Link href={`/admin/ecommerce/orders/${o.id}`} className="text-sm font-semibold text-admin-primary hover:underline">#{o.number}</Link>
                  <span className="text-sm text-admin-gray-700"> · {o.customer} · {money(o.total)} <span className={o.paymentStatus === "Paid" ? "text-emerald-600" : "text-amber-600"}>({o.paymentStatus})</span></span>
                  <p className="flex items-start gap-1 truncate text-xs text-admin-gray-500"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{o.address.replace(/\n/g, ", ")}</p>
                </div>
                {canAssign && (agents.length === 0 ? <span className="text-xs text-admin-gray-500">Add a Delivery Agent user first</span> : (
                  <div className="flex gap-2">
                    <select value={pick[o.id] ?? ""} onChange={(e) => setPick((p) => ({ ...p, [o.id]: e.target.value }))} className="h-9 rounded border border-admin-gray-200 px-2 text-sm">
                      <option value="">Choose agent…</option>
                      {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.orders.length} active)</option>)}
                    </select>
                    <button type="button" disabled={!pick[o.id] || busy === o.id} onClick={() => assign(o.id)} className="flex h-9 items-center gap-1 rounded bg-sky-600 px-3 text-sm font-semibold text-white disabled:opacity-50">
                      {busy === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Assign
                    </button>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-admin-gray-300 bg-white p-8 text-center text-sm text-admin-gray-500">
          No delivery agents yet. Go to <Link href="/admin/user-manager" className="font-semibold text-admin-primary">Users</Link> → Add User → role <b>Delivery Agent</b>.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => (
            <section key={a.id} className="rounded-xl border border-admin-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-admin-gray-100 px-4 py-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Bike className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold text-admin-gray-900">{a.name}</p><p className="text-xs text-admin-gray-500">{a.orders.length} active · {a.deliveredToday} delivered today</p></div>
              </div>
              <div className="grid grid-cols-2 gap-2 px-4 py-3 text-center">
                <div className="rounded-lg bg-amber-50 py-2"><p className="text-sm font-bold text-amber-700">{money(a.toCollect)}</p><p className="text-[11px] text-amber-700/80">to collect</p></div>
                <div className="rounded-lg bg-emerald-50 py-2"><p className="text-sm font-bold text-emerald-700">{money(a.cashToday)}</p><p className="text-[11px] text-emerald-700/80">cash today</p></div>
              </div>
              <ul className="divide-y divide-admin-gray-100 px-4 pb-2">
                {a.orders.length === 0 && <li className="py-3 text-sm text-admin-gray-400">Free — no active deliveries</li>}
                {a.orders.map((o) => (
                  <li key={o.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/admin/ecommerce/orders/${o.id}`} className="text-sm font-semibold text-admin-primary hover:underline">#{o.number}</Link>
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", o.status === "Out for Delivery" ? "bg-sky-50 text-sky-700" : "bg-admin-gray-100 text-admin-gray-600")}>
                        {o.status === "Out for Delivery" ? <Truck className="h-3 w-3" /> : <PackageCheck className="h-3 w-3" />}{o.status === "Out for Delivery" ? "On the way" : "To pick up"}
                      </span>
                    </div>
                    <p className="truncate text-xs text-admin-gray-500">{o.customer} · {money(o.total)} {o.paymentStatus !== "Paid" && <span className="text-amber-600">(collect)</span>} · assigned {ago(o.assignedAt)} ago</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {msg && <div role="status" className={cn("fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg", msg.ok ? "bg-emerald-600" : "bg-red-600")}>{msg.text}</div>}
    </div>
  );
}
