"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CheckCircle2, ChevronRight, CircleX, MapPin, MapPinned, Navigation, PackageCheck, Phone, RefreshCw, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentOrderCard } from "@/lib/agent-data";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "");

interface Stats { total: number; delivered: number; remaining: number; cancelled: number; toCollect: number; cash: number; online: number; products: number }

export function OrderCardLink({ o }: { o: AgentOrderCard }) {
  const out = o.status === "Out for Delivery";
  const done = o.status === "Delivered", cancelled = o.status === "Canceled";
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[#eaeaf2]">
      <Link href={`/agent/order/${o.id}`} className="block transition active:bg-[#fafafc]">
      <div className="flex items-center justify-between border-b border-[#f0f0f5] px-4 py-2.5">
        <span className="text-[13px] font-semibold text-[#616173]">#{o.number}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold",
          done ? "bg-[#e7f8ee] text-[#038d63]" : cancelled ? "bg-[#fdecee] text-[#d0263a]" : out ? "bg-[#eef3ff] text-[#3f64e5]" : "bg-[#fff4e0] text-[#c77700]")}>
          {done ? <><CheckCircle2 className="h-3.5 w-3.5" />Delivered {time(o.deliveredAt)}</> : cancelled ? <><CircleX className="h-3.5 w-3.5" />Cancelled</> : out ? <><Truck className="h-3.5 w-3.5" />On the way</> : <><PackageCheck className="h-3.5 w-3.5" />To pick up</>}
        </span>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold">{o.customer}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-[#616173]"><MapPin className="h-3.5 w-3.5 shrink-0 text-[#8b8ba3]" />{o.area || "No address"}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-[#8b8ba3]">
            <span>{o.itemCount} item{o.itemCount === 1 ? "" : "s"}</span>·<b className="text-[14px] text-[#353543]">{money(o.total)}</b>
            {!done && !cancelled && (o.paid ? <span className="rounded bg-[#e7f8ee] px-1.5 text-[11px] font-semibold text-[#038d63]">PAID</span> : <span className="rounded bg-[#fff4e0] px-1.5 text-[11px] font-semibold text-[#c77700]">COLLECT</span>)}
            {o.hasPin && <MapPinned className="h-3.5 w-3.5 text-[#038d63]" aria-label="Location pinned" />}
          </p>
          {cancelled && o.cancelReason && <p className="mt-1 truncate text-[12px] text-[#d0263a]">{o.cancelReason.replace(/^Cancelled by delivery agent: /, "")}</p>}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#a7a9b6]" />
      </div>
      </Link>
      {!done && !cancelled && (
        <div className="grid grid-cols-2 border-t border-[#f0f0f5] text-[13px] font-semibold">
          {o.phone
            ? <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="flex h-11 items-center justify-center gap-1.5 text-[#353543] active:bg-[#f5f5f8]"><Phone className="h-4 w-4" />Call</a>
            : <span className="flex h-11 items-center justify-center text-[#b8b8c8]">No phone</span>}
          <Link href={`/agent/order/${o.id}`} className="flex h-11 items-center justify-center gap-1.5 border-l border-[#f0f0f5] text-[var(--hp-accent)] active:bg-[#f5f5f8]"><Navigation className="h-4 w-4" />Open &amp; navigate</Link>
        </div>
      )}
    </div>
  );
}

export function AgentToday({ name, active, delivered, cancelled, stats }: { name: string; active: AgentOrderCard[]; delivered: AgentOrderCard[]; cancelled: AgentOrderCard[]; stats: Stats }) {
  const router = useRouter();
  const [tab, setTab] = useState<"todo" | "done" | "cancelled">("todo");
  const [spin, setSpin] = useState(false);
  // New assignments show up on their own.
  useEffect(() => { const t = setInterval(() => router.refresh(), 60_000); return () => clearInterval(t); }, [router]);
  const pct = stats.total ? Math.round((stats.delivered / stats.total) * 100) : 0;
  const list = tab === "todo" ? active : tab === "done" ? delivered : cancelled;
  const hour = new Date().getHours();

  return (
    <div className="space-y-3 px-3 pb-4 pt-3">
      <section className="overflow-hidden rounded-2xl text-white shadow-md" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--hp-accent) 78%, black), var(--hp-accent) 60%, #d0429f)" }}>
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] opacity-85">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
              <p className="mt-0.5 text-[21px] font-bold">{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, {name.split(" ")[0]}!</p>
            </div>
            <button type="button" onClick={() => { setSpin(true); router.refresh(); setTimeout(() => setSpin(false), 800); }} aria-label="Refresh" className="grid h-9 w-9 place-items-center rounded-full bg-white/15"><RefreshCw className={cn("h-4 w-4", spin && "animate-spin")} /></button>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <p><span className="text-[34px] font-extrabold leading-none">{stats.delivered}</span><span className="text-[16px] opacity-85"> / {stats.total} delivered</span></p>
            <p className="text-[13px] font-semibold">{stats.remaining} left</p>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/20 bg-black/10 py-2.5 text-center">
          <div><p className="text-[16px] font-bold">{stats.remaining}</p><p className="text-[11px] opacity-85">Remaining</p></div>
          <div><p className="text-[16px] font-bold">{stats.products}</p><p className="text-[11px] opacity-85">Products delivered</p></div>
          <div><p className="text-[16px] font-bold">{stats.cancelled}</p><p className="text-[11px] opacity-85">Cancelled</p></div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-[#eaeaf2]">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#c77700]"><Banknote className="h-4 w-4" />To collect</p>
          <p className="mt-1 text-[20px] font-bold">{money(stats.toCollect)}</p>
        </div>
        <div className="rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-[#eaeaf2]">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#038d63]"><CheckCircle2 className="h-4 w-4" />Collected today</p>
          <p className="mt-1 text-[20px] font-bold">{money(stats.cash + stats.online)}</p>
          <p className="text-[11.5px] text-[#8b8ba3]">Cash {money(stats.cash)} · UPI/Card {money(stats.online)}</p>
        </div>
      </section>

      <div className="sticky top-14 z-20 -mx-3 bg-[#f5f5f8] px-3 pb-2 pt-1">
        <div className="grid grid-cols-3 rounded-xl bg-white p-1 shadow-sm ring-1 ring-[#eaeaf2]">
          {([["todo", `To deliver (${active.length})`], ["done", `Delivered (${delivered.length})`], ["cancelled", `Cancelled (${cancelled.length})`]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn("h-9 rounded-lg text-[12.5px] font-semibold transition", tab === k ? "bg-[var(--hp-accent)] text-white" : "text-[#616173]")}>{l}</button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-[#eaeaf2]">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-[color-mix(in_srgb,var(--hp-accent)_9%,white)]"><Truck className="h-9 w-9 text-[var(--hp-accent)]" strokeWidth={1.6} /></span>
          <p className="mt-4 text-[16px] font-semibold">{tab === "todo" ? "No deliveries right now" : tab === "done" ? "Nothing delivered yet today" : "No cancellations today"}</p>
          {tab === "todo" && <p className="mt-1 text-[13px] text-[#8b8ba3]">New orders assigned to you will appear here.</p>}
        </div>
      ) : (
        <div className="space-y-3">{list.map((o) => <OrderCardLink key={o.id} o={o} />)}</div>
      )}
    </div>
  );
}
