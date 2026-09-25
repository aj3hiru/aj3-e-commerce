"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

/** One-click Accept on the order desk (Reject opens the order, which asks for a reason). */
export function QuickAccept({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <span className="flex items-center gap-2">
      {err && <span className="text-xs text-red-600">{err}</span>}
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true); setErr("");
        const res = await fetch(`/api/ecommerce/orders/${orderId}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_status", orderStatus: "In Progress" }) }).then((r) => r.json()).catch(() => null);
        setBusy(false);
        if (res?.success) router.refresh(); else setErr(res?.message || "Failed");
      }} className="flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Accept
      </button>
    </span>
  );
}
