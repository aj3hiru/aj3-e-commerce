"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const REASONS = ["Out of stock", "Can't deliver to this area", "Customer asked to cancel", "Duplicate order", "Suspicious / fake order"];

/**
 * Accept / Reject a new (Pending) order right from a list — no need to open it.
 * Reject asks for a reason, which goes into the order history.
 */
export function OrderDecision({ orderId, orderNumber, onDone, size = "sm" }: {
  orderId: number; orderNumber: string; onDone: (status: "In Progress" | "Canceled", message: string) => void; size?: "sm" | "md";
}) {
  const [busy, setBusy] = useState<"" | "accept" | "reject">("");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [other, setOther] = useState("");
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  function toggle() {
    if (open) { setOpen(false); return; }
    const r = box.current?.getBoundingClientRect();
    // Fixed to the window, so a scrolling table never cuts the box off; flips up near the bottom.
    if (r) setPos({ left: Math.max(8, Math.min(window.innerWidth - 272, r.right - 256)), top: r.bottom + 330 > window.innerHeight ? Math.max(8, r.top - 330) : r.bottom + 6 });
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const shut = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", shut, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", shut, true); };
  }, [open]);

  async function send(status: "In Progress" | "Canceled", note?: string) {
    setBusy(status === "In Progress" ? "accept" : "reject"); setErr("");
    const res = await fetch(`/api/ecommerce/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderStatus: status, note }) })
      .then((r) => r.json()).catch(() => null) as { success?: boolean; message?: string } | null;
    setBusy("");
    if (!res?.success) { setErr(res?.message || "Couldn't update. Try again."); return; }
    setOpen(false);
    onDone(status, status === "In Progress" ? `${orderNumber} accepted.` : `${orderNumber} rejected.`);
  }

  const h = size === "md" ? "h-9 px-3.5 text-[13px]" : "h-8 px-2.5 text-xs";
  return (
    <div ref={box} className="relative inline-flex items-center gap-1.5">
      <button type="button" disabled={!!busy} onClick={() => send("In Progress")} title={`Accept ${orderNumber}`}
        className={cn("inline-flex items-center gap-1 rounded-[8px] bg-emerald-600 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60", h)}>
        {busy === "accept" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />}Accept
      </button>
      <button type="button" disabled={!!busy} onClick={toggle} aria-expanded={open} title={`Reject ${orderNumber}`}
        className={cn("inline-flex items-center gap-1 rounded-[8px] border border-red-200 bg-white font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60", h)}>
        {busy === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}Reject
      </button>
      {open && (
        <div className="fixed z-[1200] w-64 rounded-[10px] border border-admin-gray-200 bg-white p-3 text-left shadow-xl" style={pos ?? undefined}>
          <p className="mb-2 text-[13px] font-semibold text-admin-gray-900">Why reject {orderNumber}?</p>
          <div className="space-y-1">
            {[...REASONS, "Other"].map((r) => (
              <label key={r} className={cn("flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-[13px]", reason === r ? "bg-red-50 text-red-700" : "text-admin-gray-700 hover:bg-admin-gray-50")}>
                <input type="radio" name={`rej-${orderId}`} checked={reason === r} onChange={() => setReason(r)} className="accent-red-600" />{r}
              </label>
            ))}
          </div>
          {reason === "Other" && <input autoFocus value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} placeholder="Type the reason" className="mt-2 h-9 w-full rounded-[8px] border border-admin-gray-200 px-2.5 text-[13px] outline-none focus:border-red-400" />}
          {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
          <button type="button" disabled={!!busy || (reason === "Other" && !other.trim())} onClick={() => send("Canceled", reason === "Other" ? other.trim() : reason)}
            className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] bg-red-600 text-[13px] font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {busy === "reject" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Reject order
          </button>
        </div>
      )}
      {err && !open && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
