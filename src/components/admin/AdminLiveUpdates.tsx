"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { BellRing, Truck, X } from "lucide-react";
import type { LiveEvent } from "@/lib/order-live-shared";

/** Pages that show orders: they reload their data by themselves when any order changes. */
const LIVE_PAGES = /^\/admin\/(dashboard|deliveries|ecommerce\/(orders|due|customers|sales-history))/;
const rs = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

interface Toast { key: number; title: string; body: string; href: string; icon: "order" | "truck" }

function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1175, 1568].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.3);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.16); o.stop(ctx.currentTime + i * 0.16 + 0.32);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch { /* no audio */ }
}

/**
 * Keeps every open admin tab in step: when anyone places, accepts, changes or
 * assigns an order, order pages refresh on their own, and a new online order
 * (or a delivery handed to you) pops up with a chime and a desktop notification.
 */
export function AdminLiveUpdates({ username }: { username: string }) {
  const router = useRouter();
  const path = usePathname();
  const pathRef = useRef(path);
  pathRef.current = path;
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (document.documentElement.classList.contains("app-embed")) return; // the staff app shows its own
    let stop = false;
    let after = 0;
    let pendingRefresh = false;
    const ctl = new AbortController();

    const refresh = () => {
      if (!LIVE_PAGES.test(pathRef.current)) return;
      if (document.hidden) { pendingRefresh = true; return; }
      router.refresh();
    };
    const onVisible = () => { if (!document.hidden && pendingRefresh) { pendingRefresh = false; refresh(); } };
    document.addEventListener("visibilitychange", onVisible);

    const announce = (e: LiveEvent) => {
      let t: Toast | null = null;
      if (e.type === "placed" && e.orderType === "online") t = { key: e.id, title: `New online order ${e.orderNumber}`, body: `${e.customer || "Customer"} · ${rs(e.total)}`, href: `/admin/ecommerce/orders/${e.orderId}`, icon: "order" };
      else if (e.type === "assign" && e.to === username) t = { key: e.id, title: `Delivery assigned to you`, body: `${e.orderNumber} · ${e.customer} · ${rs(e.total)}`, href: `/admin/deliveries`, icon: "truck" };
      if (!t) return;
      const toast = t;
      setToasts((x) => [...x.slice(-3), toast]);
      setTimeout(() => setToasts((x) => x.filter((y) => y.key !== toast.key)), 15000);
      chime();
      try {
        if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
          const n = new Notification(toast.title, { body: toast.body, tag: `order-${e.orderId}` });
          n.onclick = () => { window.focus(); router.push(toast.href); n.close(); };
        }
      } catch { /* not allowed */ }
    };

    (async () => {
      let fails = 0;
      while (!stop) {
        try {
          const r = await fetch(`/api/app/v1/events?after=${after}&wait=25`, { signal: ctl.signal, cache: "no-store" }).then((x) => x.json());
          if (!r?.success) throw new Error();
          fails = 0;
          const first = after === 0;
          after = r.last;
          if (!first && r.events.length) {
            (r.events as LiveEvent[]).forEach(announce);
            refresh();
          }
        } catch {
          if (stop) return;
          fails++;
          await new Promise((res) => setTimeout(res, Math.min(30_000, 2000 * fails)));
        }
      }
    })();
    return () => { stop = true; ctl.abort(); document.removeEventListener("visibilitychange", onVisible); };
  }, [router, username]);

  // Ask once for desktop notifications, on the first click anywhere (browsers need a click).
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    const ask = () => { Notification.requestPermission().catch(() => {}); };
    document.addEventListener("click", ask, { once: true });
    return () => document.removeEventListener("click", ask);
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="fixed right-4 top-4 z-[2000] flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.key} className="flex items-start gap-3 rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-xl">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">{t.icon === "truck" ? <Truck className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-admin-gray-900">{t.title}</p>
            <p className="truncate text-xs text-admin-gray-500">{t.body}</p>
            <Link href={t.href} onClick={() => setToasts((x) => x.filter((y) => y.key !== t.key))} className="mt-1 inline-block text-xs font-semibold text-admin-primary">Open</Link>
          </div>
          <button type="button" onClick={() => setToasts((x) => x.filter((y) => y.key !== t.key))} aria-label="Close" className="rounded p-1 text-admin-gray-400 hover:bg-admin-gray-100"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
