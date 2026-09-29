"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { usePush } from "@/components/shop/push/PushContext";

const KEY = "stock_alerts";
const saved = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const remember = (k: string) => { try { localStorage.setItem(KEY, JSON.stringify([...saved().filter((x) => x !== k), k].slice(-100))); } catch { /* private mode */ } };

/**
 * "Notify me" for an out-of-stock product (or size): asks for notification
 * permission if needed, then registers the alert — a push arrives when it is back.
 */
export function useNotifyMe(productId: number, sizeId: number | null, onMessage: (msg: string) => void) {
  const { state, subscribe } = usePush();
  const key = `${productId}:${sizeId ?? 0}`;
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDone(saved().includes(key)); }, [key]);

  async function request() {
    if (busy || done) return;
    setBusy(true);
    try {
      if (state === "denied") { onMessage("Notifications are blocked — allow them from the 🔒 next to the web address."); return; }
      if (state !== "subscribed" && state !== "unsupported" && state !== "off") await subscribe();
      let endpoint: string | null = null;
      if ("serviceWorker" in navigator && "Notification" in window && Notification.permission === "granted") {
        const reg = await navigator.serviceWorker.getRegistration();
        endpoint = (await reg?.pushManager.getSubscription())?.endpoint ?? null;
      }
      const res = await fetch("/api/shop/stock-alert", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, sizeId, endpoint }),
      }).then((r) => r.json()).catch(() => null);
      if (res?.success) { remember(key); setDone(true); }
      onMessage(res?.message || "Couldn't save — please try again.");
    } finally {
      setBusy(false);
    }
  }
  return { done, busy, request };
}

export function NotifyIcon({ done, busy, className }: { done: boolean; busy: boolean; className?: string }) {
  if (busy) return <Loader2 className={`${className ?? ""} animate-spin`} />;
  return done ? <BellRing className={className} /> : <Bell className={className} />;
}
