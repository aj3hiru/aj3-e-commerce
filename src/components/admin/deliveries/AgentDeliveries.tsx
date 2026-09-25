"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CheckCircle2, CircleAlert, Loader2, MapPin, Navigation, PackageCheck, Phone, Truck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliveryCard } from "@/lib/deliveries";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

async function act(id: number, body: Record<string, unknown>) {
  const res = await fetch(`/api/ecommerce/deliveries/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
  return { ok: !!res?.success, message: res?.message || "Couldn't update — check your connection." };
}

function Card({ o, onDone }: { o: DeliveryCard; onDone: (msg: string, ok: boolean) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [method, setMethod] = useState("Cash");
  const [failing, setFailing] = useState(false);
  const [reason, setReason] = useState("");
  const paid = o.paymentStatus === "Paid";
  const out = o.status === "Out for Delivery";

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    const r = await act(o.id, { action, ...extra });
    setBusy(null);
    onDone(r.message, r.ok);
  }

  return (
    <article className={cn("overflow-hidden rounded-xl border bg-white shadow-sm", out ? "border-sky-300" : "border-admin-gray-200")}>
      <div className={cn("flex items-center justify-between px-4 py-2 text-xs font-semibold", out ? "bg-sky-50 text-sky-700" : "bg-admin-gray-50 text-admin-gray-600")}>
        <span>#{o.number}</span>
        <span className="flex items-center gap-1">{out ? <><Truck className="h-3.5 w-3.5" />On the way</> : "Ready to pick up"}</span>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="text-base font-bold text-admin-gray-900">{o.customer}</p>
          <p className="mt-1 flex gap-1.5 whitespace-pre-line text-sm leading-5 text-admin-gray-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-admin-gray-400" />{o.address || "No address"}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a href={o.navUrl} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-sky-600 text-sm font-semibold text-white active:bg-sky-700"><Navigation className="h-4 w-4" />Navigate</a>
          {o.phone
            ? <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-admin-gray-300 text-sm font-semibold text-admin-gray-800 active:bg-admin-gray-50"><Phone className="h-4 w-4" />Call</a>
            : <span className="flex h-11 items-center justify-center rounded-lg border border-dashed border-admin-gray-200 text-xs text-admin-gray-400">No phone</span>}
        </div>
        {!o.mapUrl && <p className="text-xs text-amber-700">No pinned location — navigation uses the written address.</p>}
        <p className="text-sm text-admin-gray-600"><b className="text-admin-gray-800">{o.itemCount} item{o.itemCount === 1 ? "" : "s"}:</b> {o.items}</p>

        <div className={cn("rounded-lg px-3 py-2.5", paid ? "bg-emerald-50" : "bg-amber-50")}>
          {paid ? (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Paid — nothing to collect</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-800">Collect {money(o.total)} <span className="font-normal">({o.paymentName})</span></p>
              <div className="mt-2 flex gap-2">
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2 text-sm">
                  {["Cash", "UPI", "Card"].map((m) => <option key={m}>{m}</option>)}
                </select>
                <button type="button" disabled={!!busy} onClick={() => run("collect", { method })} className="flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-60">
                  {busy === "collect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}Collected
                </button>
              </div>
            </>
          )}
        </div>

        {!out ? (
          <button type="button" disabled={!!busy} onClick={() => run("start")} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-admin-primary text-sm font-bold text-white disabled:opacity-60">
            {busy === "start" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}Picked up — start delivery
          </button>
        ) : (
          <>
            <button type="button" disabled={!!busy || !paid} onClick={() => run("deliver")} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">
              {busy === "deliver" ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageCheck className="h-5 w-5" />}Mark Delivered
            </button>
            {!paid && <p className="flex items-center gap-1.5 text-xs text-amber-700"><CircleAlert className="h-3.5 w-3.5" />Collect the payment first — then mark it delivered.</p>}
          </>
        )}
        {!failing
          ? <button type="button" onClick={() => setFailing(true)} className="w-full text-center text-xs font-semibold text-red-600">Couldn&rsquo;t deliver?</button>
          : (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex flex-wrap gap-1.5">
                {["Customer not reachable", "Door locked", "Wrong address", "Customer refused"].map((r) => (
                  <button key={r} type="button" onClick={() => setReason(r)} className={cn("rounded-full border px-2.5 py-1 text-xs", reason === r ? "border-red-400 bg-white text-red-700" : "border-red-200 text-red-600")}>{r}</button>
                ))}
              </div>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="h-10 w-full rounded-lg border border-red-200 px-3 text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setFailing(false)} className="h-9 flex-1 rounded-lg bg-white text-sm"><X className="mx-auto h-4 w-4" /></button>
                <button type="button" disabled={!!busy || reason.trim().length < 3} onClick={() => run("fail", { note: reason })} className="h-9 flex-[2] rounded-lg bg-red-600 text-sm font-semibold text-white disabled:opacity-50">Report</button>
              </div>
            </div>
          )}
      </div>
    </article>
  );
}

/** A delivery agent's day: today's numbers and one card per order to deliver. */
export function AgentDeliveries({ active, done, stats }: { active: DeliveryCard[]; done: DeliveryCard[]; stats: { toDeliver: number; deliveredToday: number; toCollect: number; cashToday: number; otherToday: number } }) {
  const router = useRouter();
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const onDone = (text: string, ok: boolean) => { setToast({ ok, text }); if (ok) router.refresh(); setTimeout(() => setToast(null), 3000); };
  const tiles = [
    { label: "To deliver", value: String(stats.toDeliver), cls: "text-sky-700" },
    { label: "Delivered today", value: String(stats.deliveredToday), cls: "text-emerald-700" },
    { label: "Cash to collect", value: money(stats.toCollect), cls: "text-amber-700" },
    { label: "Cash in hand today", value: money(stats.cashToday), cls: "text-admin-gray-900", sub: stats.otherToday ? `+ ${money(stats.otherToday)} UPI/card` : undefined },
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-admin-gray-200 bg-white p-3 shadow-sm">
            <p className={cn("text-xl font-extrabold", t.cls)}>{t.value}</p>
            <p className="text-xs text-admin-gray-500">{t.label}</p>
            {t.sub && <p className="text-[11px] text-admin-gray-400">{t.sub}</p>}
          </div>
        ))}
      </div>
      {active.length === 0
        ? <div className="rounded-xl border border-dashed border-admin-gray-300 bg-white p-10 text-center text-sm text-admin-gray-500"><Truck className="mx-auto mb-2 h-8 w-8 text-admin-gray-300" />No deliveries assigned right now.</div>
        : active.map((o) => <Card key={o.id} o={o} onDone={onDone} />)}
      {done.length > 0 && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-bold text-admin-gray-800">Delivered today ({done.length})</h3>
          <ul className="divide-y divide-admin-gray-100 text-sm">
            {done.map((o) => <li key={o.id} className="flex justify-between py-2"><span>#{o.number} · {o.customer}</span><span className="font-semibold">{money(o.total)}</span></li>)}
          </ul>
        </section>
      )}
      {toast && <div role="status" className={cn("fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg", toast.ok ? "bg-emerald-600" : "bg-red-600")}>{toast.text}</div>}
    </div>
  );
}
