"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";

/**
 * The storefront's "Allow notifications" prompt — the Next.js port of
 * push_notifications/push.js. It never calls the browser permission prompt on
 * its own (browsers penalise that); a small card appears after a few seconds
 * and only an explicit click asks for permission. Dismissing it snoozes it.
 *
 * It also keeps an existing subscription in sync: if the browser already
 * granted permission, the current subscription is re-saved (the server upserts
 * by endpoint), and if the VAPID key changed the old subscription is replaced.
 */

const SHOW_DELAY_MS = 5_000; // push.js C.DELAY
const SNOOZE_MS = 24 * 60 * 60 * 1000; // after "✕" or a declined prompt
const K_SNOOZE = "push_last_closed";
const K_KEY = "push_vapid_key"; // the public key this browser subscribed with
const K_SYNC = "push_last_sync";

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const padded = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

async function saveSubscription(sub: PushSubscription): Promise<boolean> {
  const res = await fetch("/api/push2/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()),
  }).catch(() => null);
  return !!res?.ok;
}

async function subscribe(reg: ServiceWorkerRegistration, publicKey: string): Promise<boolean> {
  let sub = await reg.pushManager.getSubscription();
  if (sub && store.get(K_KEY) !== publicKey) {
    // Subscribed with an old key — the server can't reach it any more.
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const ok = await saveSubscription(sub);
  if (ok) { store.set(K_KEY, publicKey); store.set(K_SYNC, String(Date.now())); }
  return ok;
}

export function PushOptIn({ appName }: { appName: string }) {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false); // drives the slide-in transition
  const [done, setDone] = useState(false);
  const ctx = useRef<{ reg: ServiceWorkerRegistration; key: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/push2/subscribe").catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) : null;
      if (!data?.publicKey || cancelled) return; // push not configured on the server
      const reg = await navigator.serviceWorker.register("/sw.js").catch(() => null);
      if (!reg || cancelled) return;
      ctx.current = { reg, key: data.publicKey };

      if (Notification.permission === "granted") {
        // Already allowed: quietly keep the server's copy fresh (at most daily,
        // or right away if the key changed).
        const last = Number(store.get(K_SYNC) ?? 0);
        if (store.get(K_KEY) !== data.publicKey || Date.now() - last > SNOOZE_MS) {
          await navigator.serviceWorker.ready;
          await subscribe(reg, data.publicKey).catch(() => {});
        }
        return;
      }
      if (Notification.permission === "denied") return;

      const snoozedAt = Number(store.get(K_SNOOZE) ?? 0);
      const wait = Math.max(SHOW_DELAY_MS, snoozedAt + SNOOZE_MS - Date.now());
      if (wait > SNOOZE_MS) return;
      timer = setTimeout(() => { if (!cancelled) setVisible(true); }, wait);
    })();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [visible]);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 3_000);
    return () => clearTimeout(t);
  }, [done]);

  function close() {
    store.set(K_SNOOZE, String(Date.now()));
    setShown(false);
    setTimeout(() => setVisible(false), 300);
  }

  async function allow() {
    setShown(false);
    setTimeout(() => setVisible(false), 300);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted" || !ctx.current) { store.set(K_SNOOZE, String(Date.now())); return; }
      await navigator.serviceWorker.ready;
      if (await subscribe(ctx.current.reg, ctx.current.key)) setDone(true);
    } catch {
      store.set(K_SNOOZE, String(Date.now()));
    }
  }

  return (
    <>
      {visible && (
        <div role="dialog" aria-label="Enable notifications"
          className={`fixed bottom-4 left-4 right-4 z-[1500] mx-auto max-w-sm rounded-2xl border border-storefront-border bg-white p-4 shadow-[0_10px_40px_rgba(0,0,0,0.18)] transition-all duration-300 sm:left-6 sm:right-auto sm:mx-0 ${shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}>
          <button type="button" onClick={close} aria-label="Close" className="absolute right-2.5 top-2.5 rounded p-1 text-storefront-muted hover:bg-storefront-bg hover:text-storefront-text">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3.5 pr-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-storefront-green-light text-storefront-green">
              <Bell className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold leading-snug text-storefront-text">Get offers &amp; updates from {appName}</h3>
              <p className="mt-0.5 text-sm text-storefront-muted">New arrivals, deals and order news — straight to your device.</p>
              <button type="button" onClick={allow}
                className="mt-3 h-9 rounded-lg bg-storefront-green px-4 text-sm font-semibold text-white transition-colors hover:bg-storefront-green-dark">
                Allow Notifications
              </button>
            </div>
          </div>
        </div>
      )}
      {done && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[1500] -translate-x-1/2 rounded-full bg-storefront-green px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          Notifications Enabled!
        </div>
      )}
    </>
  );
}
