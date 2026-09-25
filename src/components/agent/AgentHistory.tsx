import Link from "next/link";
import { Banknote, CalendarDays, CircleX, MapPinned, PackageCheck, ShoppingBag, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentOrderCard } from "@/lib/agent-data";
import { OrderCardLink } from "./AgentToday";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const ymd = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

export function presetRange(key: string): { from: string; to: string } {
  const today = new Date();
  const t = ymd(today);
  const day = (n: number) => ymd(new Date(today.getTime() - n * 86_400_000));
  switch (key) {
    case "yesterday": return { from: day(1), to: day(1) };
    case "7d": return { from: day(6), to: t };
    case "30d": return { from: day(29), to: t };
    case "month": return { from: `${t.slice(0, 8)}01`, to: t };
    default: return { from: t, to: t };
  }
}

interface Totals { delivered: number; cancelled: number; products: number; value: number; cash: number; online: number; addresses: number }

/** Delivery history with date filters, totals and each order (grouped by day). */
export function AgentHistory({ from, to, preset, orders, totals }: { from: string; to: string; preset: string; orders: AgentOrderCard[]; totals: Totals }) {
  const chips = [["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 days"], ["month", "This month"], ["30d", "30 days"]] as const;
  const groups = new Map<string, AgentOrderCard[]>();
  for (const o of orders) {
    const k = o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—";
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const tiles = [
    { icon: PackageCheck, label: "Orders delivered", value: String(totals.delivered), tone: "text-[#038d63] bg-[#e7f8ee]" },
    { icon: ShoppingBag, label: "Products delivered", value: String(totals.products), tone: "text-[#3f64e5] bg-[#eef3ff]" },
    { icon: MapPinned, label: "Addresses", value: String(totals.addresses), tone: "text-[var(--hp-accent)] bg-[color-mix(in_srgb,var(--hp-accent)_10%,white)]" },
    { icon: CircleX, label: "Cancelled", value: String(totals.cancelled), tone: "text-[#d0263a] bg-[#fdecee]" },
    { icon: Banknote, label: "Cash collected", value: money(totals.cash), tone: "text-[#c77700] bg-[#fff4e0]" },
    { icon: Wallet, label: "UPI / card collected", value: money(totals.online), tone: "text-[#0e7490] bg-[#e0f5f9]" },
  ];

  return (
    <div className="space-y-3 px-3 pb-4 pt-3">
      <section className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-[#eaeaf2]">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {chips.map(([k, l]) => (
            <Link key={k} href={`/agent/history?range=${k}`} className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-[13px]", preset === k ? "border-[var(--hp-accent)] bg-[color-mix(in_srgb,var(--hp-accent)_8%,white)] font-semibold text-[var(--hp-accent)]" : "border-[#dcdce6] text-[#616173]")}>{l}</Link>
          ))}
        </div>
        <form action="/agent/history" method="GET" className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <label className="text-[12px] text-[#8b8ba3]">From<input type="date" name="from" defaultValue={from} max={to} className="mt-0.5 h-10 w-full rounded-[4px] border border-[#cfcedc] px-2 text-[14px] text-[#353543]" /></label>
          <label className="text-[12px] text-[#8b8ba3]">To<input type="date" name="to" defaultValue={to} className="mt-0.5 h-10 w-full rounded-[4px] border border-[#cfcedc] px-2 text-[14px] text-[#353543]" /></label>
          <button type="submit" className="h-10 rounded-[4px] bg-[var(--hp-accent)] px-4 text-[14px] font-semibold text-white">Show</button>
        </form>
      </section>

      <p className="flex items-center gap-1.5 px-1 text-[13px] text-[#616173]"><CalendarDays className="h-4 w-4" />{from === to ? new Date(from).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : `${new Date(from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(to).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`} · order value {money(totals.value)}</p>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="flex items-center gap-2.5 rounded-xl bg-white p-3 shadow-sm ring-1 ring-[#eaeaf2]">
            <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", t.tone)}><t.icon className="h-5 w-5" /></span>
            <span className="min-w-0"><span className="block text-[18px] font-bold leading-6">{t.value}</span><span className="block truncate text-[11.5px] text-[#8b8ba3]">{t.label}</span></span>
          </div>
        ))}
      </section>

      {orders.length === 0 ? (
        <div className="rounded-xl bg-white px-6 py-12 text-center text-[14px] text-[#8b8ba3] shadow-sm ring-1 ring-[#eaeaf2]">No deliveries in this period.</div>
      ) : (
        [...groups].map(([day, list]) => (
          <div key={day} className="space-y-2.5">
            <p className="px-1 pt-1 text-[13px] font-semibold text-[#616173]">{day} · {list.filter((o) => o.status === "Delivered").length} delivered</p>
            {list.map((o) => <OrderCardLink key={o.id} o={o} />)}
          </div>
        ))
      )}
    </div>
  );
}
