"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Banknote, CheckCircle2, CircleAlert, CircleX, Clock, History, ImageIcon, Loader2, MapPin, MessageCircle, PackageCheck,
  Phone, RotateCcw, Truck, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentOrder } from "@/lib/agent-data";
import { LiveMap } from "./LiveMap";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const OTHER = "__other";
const CANCEL_REASONS = ["Customer refused to take the order", "Customer not answering calls", "Product is damaged", "Wrong / incomplete address", "Customer not at home", "Customer asked to cancel"];
const RETRY_REASONS = ["Customer not answering — will try again", "Customer asked to come later", "Door locked", "Vehicle / traffic problem"];

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-[640px] rounded-t-2xl bg-white pb-[max(16px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex h-14 items-center justify-between border-b border-[#eaeaf2] px-4">
          <p className="text-[16px] font-semibold">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#f5f5f8]"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-4 pt-4">{children}</div>
      </div>
    </div>
  );
}

function ReasonPicker({ reasons, value, onChange, other }: { reasons: string[]; value: string; onChange: (v: string) => void; other: string }) {
  return (
    <div className="space-y-2">
      {[...reasons, other].map((r) => {
        const on = r === other ? value === OTHER : value === r;
        return (
          <button key={r} type="button" onClick={() => onChange(r === other ? OTHER : r)} aria-pressed={on}
            className={cn("flex w-full items-center gap-3 rounded-[8px] border px-3.5 py-3 text-left text-[14px]", on ? "border-[var(--hp-accent)] bg-[color-mix(in_srgb,var(--hp-accent)_5%,white)]" : "border-[#dcdce6]")}>
            <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-[var(--hp-accent)]" : "border-[#b9b9c9]")}>{on && <span className="h-2.5 w-2.5 rounded-full bg-[var(--hp-accent)]" />}</span>{r}
          </button>
        );
      })}
    </div>
  );
}

export function AgentOrderView({ o }: { o: AgentOrder }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [method, setMethod] = useState("Cash");
  const [sheet, setSheet] = useState<null | "cancel" | "retry" | "collect">(null);
  const [reason, setReason] = useState("");
  const [otherText, setOtherText] = useState("");
  const out = o.status === "Out for Delivery", ready = o.status === "In Progress";
  const done = o.status === "Delivered", cancelled = o.status === "Canceled";
  const lines = o.address.split("\n");

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    const res = await fetch(`/api/ecommerce/deliveries/${o.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(null);
    const ok = !!res?.success;
    setToast({ ok, text: res?.message || "Couldn't update — check your internet." });
    setTimeout(() => setToast(null), 3000);
    if (ok) { setSheet(null); setReason(""); setOtherText(""); router.refresh(); }
    return ok;
  }
  const finalReason = reason === OTHER ? otherText.trim() : reason;

  return (
    <div className="pb-[calc(96px+env(safe-area-inset-bottom))]">
      <div className="sticky top-14 z-20 flex h-12 items-center gap-2 border-b border-[#eaeaf2] bg-white px-2">
        <Link href="/agent" aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full hover:bg-[#f5f5f8]"><ArrowLeft className="h-5 w-5" /></Link>
        <p className="flex-1 text-[15px] font-semibold">Order #{o.number}</p>
        <span className={cn("mr-2 rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
          done ? "bg-[#e7f8ee] text-[#038d63]" : cancelled ? "bg-[#fdecee] text-[#d0263a]" : out ? "bg-[#eef3ff] text-[#3f64e5]" : "bg-[#fff4e0] text-[#c77700]")}>
          {done ? "Delivered" : cancelled ? "Cancelled" : out ? "On the way" : "To pick up"}
        </span>
      </div>

      <div className="space-y-3 px-3 pt-3">
        {cancelled && o.cancelReason && <div className="flex gap-2 rounded-xl bg-[#fdecee] px-4 py-3 text-[13.5px] text-[#d0263a]"><CircleX className="h-5 w-5 shrink-0" />{o.cancelReason}</div>}
        {done && <div className="flex items-center gap-2 rounded-xl bg-[#e7f8ee] px-4 py-3 text-[14px] font-semibold text-[#038d63]"><CheckCircle2 className="h-5 w-5" />Delivered{o.deliveredAt && ` on ${when(o.deliveredAt)}`}</div>}

        {/* Customer */}
        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-[#eaeaf2]">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#8b8ba3]">Deliver to</p>
          <p className="mt-1 text-[18px] font-bold">{o.customer}</p>
          {o.phone && <p className="text-[14px] text-[#616173]">{o.phone}</p>}
          {o.orderedBy && <p className="text-[12px] text-[#8b8ba3]">Ordered by {o.orderedBy}</p>}
          <div className="mt-2 flex gap-2 text-[14px] leading-5 text-[#353543]">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hp-accent)]" />
            <p className="whitespace-pre-line">{(lines.length > 1 ? lines.slice(1) : lines).join("\n") || "No address"}</p>
          </div>
          {!done && !cancelled && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {o.phone ? (
                <>
                  <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="flex h-11 items-center justify-center gap-1.5 rounded-[6px] border border-[var(--hp-accent)] text-[14px] font-semibold text-[var(--hp-accent)]"><Phone className="h-4 w-4" />Call</a>
                  <a href={`https://wa.me/${o.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}`} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-[6px] border border-[#25d366] text-[14px] font-semibold text-[#128c4b]"><MessageCircle className="h-4 w-4" />WhatsApp</a>
                </>
              ) : <p className="col-span-2 text-[12.5px] text-[#8b8ba3]">No phone number on this order.</p>}
            </div>
          )}
        </section>

        {!done && !cancelled && <LiveMap dest={o.lat !== null && o.lng !== null ? [o.lat, o.lng] : null} addressText={o.address} />}

        {/* Items */}
        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-[#eaeaf2]">
          <p className="mb-2 text-[15px] font-semibold">Items ({o.items.reduce((n, i) => n + i.qty, 0)})</p>
          <ul className="divide-y divide-[#f0f0f5]">
            {o.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[6px] border border-[#eaeaf2] bg-white">
                  {i.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={`/${i.image}`} alt="" className="h-full w-full object-contain" />
                    : <span className="grid h-full w-full place-items-center bg-[#f5f5f8] text-[#c9c9d6]"><ImageIcon className="h-5 w-5" /></span>}
                </span>
                <span className="min-w-0 flex-1"><span className="line-clamp-2 text-[14px]">{i.name}</span><span className="text-[12px] text-[#8b8ba3]">{money(i.price)} each</span></span>
                <span className="rounded-md bg-[#f5f5f8] px-2 py-1 text-[14px] font-bold">×{i.qty}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-1 border-t border-dashed border-[#dcdce6] pt-2 text-[13.5px] text-[#616173]">
            <p className="flex justify-between"><span>Items</span><span>{money(o.subtotal)}</span></p>
            {o.discount > 0 && <p className="flex justify-between text-[#038d63]"><span>Discount</span><span>- {money(o.discount)}</span></p>}
            {o.gst > 0 && <p className="flex justify-between"><span>GST</span><span>+ {money(o.gst)}</span></p>}
            <p className="flex justify-between text-[16px] font-bold text-[#353543]"><span>Total</span><span>{money(o.total)}</span></p>
          </div>
        </section>

        {/* Payment */}
        <section className={cn("rounded-xl p-4 shadow-sm ring-1", o.paid ? "bg-[#e7f8ee] ring-[#c7eed8]" : "bg-[#fff8ec] ring-[#ffe2b3]")}>
          {o.paid ? (
            <p className="flex items-center gap-2 text-[15px] font-semibold text-[#038d63]"><CheckCircle2 className="h-5 w-5" />Payment received — nothing to collect</p>
          ) : (
            <>
              <p className="text-[13px] font-medium text-[#c77700]">{o.paymentName} · collect before handing over</p>
              <p className="mt-0.5 text-[26px] font-extrabold text-[#353543]">{money(o.total)}</p>
              {!cancelled && (
                <button type="button" onClick={() => setSheet("collect")} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#038d63] text-[15px] font-bold text-white"><Banknote className="h-5 w-5" />Payment collected</button>
              )}
            </>
          )}
        </section>

        {/* History */}
        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-[#eaeaf2]">
          <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold"><History className="h-4 w-4 text-[var(--hp-accent)]" />Order timeline</p>
          <ol className="relative ml-1.5 border-l-2 border-[#eaeaf2]">
            {o.events.slice().reverse().map((e) => (
              <li key={e.id} className="relative mb-3 pl-4 last:mb-0">
                <span className="absolute -left-[6px] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--hp-accent)]" />
                <p className="text-[13.5px]">{e.type === "placed" ? "Order placed" : e.type === "assign" ? `Assigned to ${e.to ?? "—"}` : e.type === "payment" ? `Payment ${e.to}` : e.type === "note" ? "Note" : `${e.from} → ${e.to}`}</p>
                {e.note && <p className="text-[12.5px] text-[#616173]">{e.note}</p>}
                <p className="text-[11.5px] text-[#a7a9b6]">{when(e.at)} · {e.actor}</p>
              </li>
            ))}
            <li className="relative pl-4"><span className="absolute -left-[6px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#dcdce6]" /><p className="flex items-center gap-1 text-[12px] text-[#a7a9b6]"><Clock className="h-3 w-3" />Placed {when(o.placedAt)}</p></li>
          </ol>
        </section>

        {(ready || out) && (
          <div className="grid grid-cols-2 gap-2 pb-2">
            <button type="button" onClick={() => { setSheet("retry"); setReason(""); }} className="flex h-11 items-center justify-center gap-1.5 rounded-[6px] border border-[#dcdce6] bg-white text-[13.5px] font-semibold text-[#616173]"><RotateCcw className="h-4 w-4" />Can&rsquo;t deliver now</button>
            <button type="button" onClick={() => { setSheet("cancel"); setReason(""); }} className="flex h-11 items-center justify-center gap-1.5 rounded-[6px] border border-[#f3b8c0] bg-white text-[13.5px] font-semibold text-[#d0263a]"><CircleX className="h-4 w-4" />Cancel order</button>
          </div>
        )}
      </div>

      {/* Main action, fixed above the tab bar */}
      {(ready || out) && (
        <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-20 border-t border-[#eaeaf2] bg-white px-3 py-2.5 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
          <div className="mx-auto max-w-[640px]">
            {ready ? (
              <button type="button" disabled={!!busy} onClick={() => act("start")} className="flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--hp-accent)] text-[15px] font-bold text-white disabled:opacity-60">
                {busy === "start" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}Picked up — start delivery
              </button>
            ) : (
              <>
                <button type="button" disabled={!!busy || !o.paid} onClick={() => act("deliver")} className="flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#038d63] text-[15px] font-bold text-white disabled:opacity-50">
                  {busy === "deliver" ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageCheck className="h-5 w-5" />}Mark as Delivered
                </button>
                {!o.paid && <p className="mt-1 flex items-center justify-center gap-1 text-[12px] text-[#c77700]"><CircleAlert className="h-3.5 w-3.5" />Collect {money(o.total)} first, then mark delivered</p>}
              </>
            )}
          </div>
        </div>
      )}

      {sheet === "collect" && (
        <Sheet title={`Collect ${money(o.total)}`} onClose={() => setSheet(null)}>
          <p className="mb-3 text-[13.5px] text-[#616173]">How did the customer pay?</p>
          <div className="grid grid-cols-3 gap-2">
            {["Cash", "UPI", "Card"].map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
                className={cn("h-14 rounded-[8px] border text-[15px] font-semibold", method === m ? "border-[#038d63] bg-[#e7f8ee] text-[#038d63]" : "border-[#dcdce6]")}>{m}</button>
            ))}
          </div>
          <button type="button" disabled={!!busy} onClick={() => act("collect", { method })} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#038d63] text-[15px] font-bold text-white disabled:opacity-60">
            {busy === "collect" ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}Yes, I received {money(o.total)}
          </button>
        </Sheet>
      )}

      {(sheet === "cancel" || sheet === "retry") && (
        <Sheet title={sheet === "cancel" ? "Why cancel this order?" : "Why can't you deliver now?"} onClose={() => setSheet(null)}>
          <div className="max-h-[55vh] overflow-y-auto pb-1">
            <ReasonPicker reasons={sheet === "cancel" ? CANCEL_REASONS : RETRY_REASONS} value={reason} onChange={setReason} other="Other reason" />
            {reason === OTHER && (
              <textarea autoFocus value={otherText} onChange={(e) => setOtherText(e.target.value)} rows={2} placeholder="Write the reason" className="mt-2 w-full rounded-[4px] border border-[#cfcedc] px-3 py-2 text-[14px] outline-none focus:border-[var(--hp-accent)]" />
            )}
          </div>
          {sheet === "cancel" && <p className="mt-2 text-[12px] text-[#8b8ba3]">The order is cancelled and the customer sees this reason.</p>}
          <button type="button" disabled={!!busy || finalReason.length < 3} onClick={() => act(sheet === "cancel" ? "cancel" : "fail", { note: finalReason })}
            className={cn("mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[6px] text-[15px] font-bold text-white disabled:opacity-50", sheet === "cancel" ? "bg-[#d0263a]" : "bg-[#353543]")}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}{sheet === "cancel" ? "Cancel order" : "Report & try later"}
          </button>
        </Sheet>
      )}

      {toast && <div role="status" className={cn("fixed left-1/2 top-16 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-[13.5px] font-semibold text-white shadow-lg", toast.ok ? "bg-[#038d63]" : "bg-[#d0263a]")}>{toast.text}</div>}
    </div>
  );
}
