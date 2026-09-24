"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, BellOff, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PushUiConfig } from "@/types/storefront";

/**
 * Storefront push notifications (replaces the old PushOptIn card):
 *  - state shared by every bell (desktop header, mobile header, sidebar), so
 *    subscribing anywhere hides all of them at once
 *  - first-visit prompt using the browser's own Allow/Block dialog:
 *      Chrome/Edge → shortly after the page loads
 *      Firefox/Safari → on the visitor's first tap/click (they refuse to ask
 *      without one), so the dialog still appears as early as allowed
 *    A dismissed prompt isn't repeated for 3 days (Chrome silences sites that
 *    ask on every page).
 *  - keeps an existing subscription in sync with the server / current VAPID key
 */

export type PushState = "loading" | "unsupported" | "off" | "default" | "denied" | "subscribed";

const K_KEY = "push_vapid_key"; // public key this browser subscribed with
const K_SYNC = "push_last_sync";
const K_PROMPTED = "push_prompted_at";
const REPROMPT_MS = 3 * 24 * 60 * 60 * 1000;
const SYNC_MS = 24 * 60 * 60 * 1000;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const padded = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function subscribeBrowser(reg: ServiceWorkerRegistration, publicKey: string): Promise<boolean> {
  let sub = await reg.pushManager.getSubscription();
  if (sub && store.get(K_KEY) !== publicKey) { await sub.unsubscribe().catch(() => {}); sub = null; } // made with an old key
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const res = await fetch("/api/push2/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()),
  }).catch(() => null);
  if (!res?.ok) return false;
  store.set(K_KEY, publicKey);
  store.set(K_SYNC, String(Date.now()));
  return true;
}

/** Chromium browsers show a permission prompt without a user gesture; Firefox and Safari don't. */
function canPromptWithoutGesture(): boolean {
  const brands = (navigator as unknown as { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  return !!brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand));
}

interface PushCtx { state: PushState; showBell: boolean; subscribe: () => Promise<void>; justSubscribed: boolean }
const Ctx = createContext<PushCtx>({ state: "loading", showBell: false, subscribe: async () => {}, justSubscribed: false });
export const usePush = () => useContext(Ctx);

export function PushProvider({ config, children }: { config: PushUiConfig; children: React.ReactNode }) {
  const [state, setState] = useState<PushState>("loading");
  const [justSubscribed, setJustSubscribed] = useState(false);
  const ctx = useRef<{ reg: ServiceWorkerRegistration; key: string } | null>(null);
  const busy = useRef(false);

  const subscribe = useCallback(async () => {
    if (busy.current || typeof window === "undefined" || !("Notification" in window)) return;
    busy.current = true;
    try {
      // requestPermission() must run first, inside the click/tap, for Firefox/Safari.
      const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      store.set(K_PROMPTED, String(Date.now()));
      if (perm === "denied") { setState("denied"); return; }
      if (perm !== "granted" || !ctx.current) { setState("default"); return; }
      await navigator.serviceWorker.ready;
      if (await subscribeBrowser(ctx.current.reg, ctx.current.key)) { setState("subscribed"); setJustSubscribed(true); }
      else setState("default");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "default");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
    let cancelled = false;
    let removeGesture: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const res = await fetch("/api/push2/subscribe").catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) : null;
      if (cancelled) return;
      if (!data?.publicKey) { setState("off"); return; } // push not configured on the server
      const reg = await navigator.serviceWorker.register("/sw.js").catch(() => null);
      if (!reg || cancelled) { setState("unsupported"); return; }
      ctx.current = { reg, key: data.publicKey };

      if (Notification.permission === "denied") { setState("denied"); return; }
      if (Notification.permission === "granted") {
        await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        const fresh = existing && store.get(K_KEY) === data.publicKey && Date.now() - Number(store.get(K_SYNC) ?? 0) < SYNC_MS;
        const ok = fresh || (await subscribeBrowser(reg, data.publicKey).catch(() => false));
        if (!cancelled) setState(ok ? "subscribed" : "default");
        return;
      }

      setState("default");
      if (!config.autoPrompt) return;
      if (Date.now() - Number(store.get(K_PROMPTED) ?? 0) < REPROMPT_MS) return;
      if (canPromptWithoutGesture()) {
        timer = setTimeout(() => { if (!cancelled) void subscribe(); }, 1500);
      } else {
        const onFirstGesture = () => { removeGesture?.(); void subscribe(); };
        document.addEventListener("pointerdown", onFirstGesture, { once: true, capture: true });
        document.addEventListener("keydown", onFirstGesture, { once: true, capture: true });
        removeGesture = () => {
          document.removeEventListener("pointerdown", onFirstGesture, { capture: true });
          document.removeEventListener("keydown", onFirstGesture, { capture: true });
        };
      }
    })();

    return () => { cancelled = true; if (timer) clearTimeout(timer); removeGesture?.(); };
  }, [config.autoPrompt, subscribe]);

  useEffect(() => {
    if (!justSubscribed) return;
    const t = setTimeout(() => setJustSubscribed(false), 3000);
    return () => clearTimeout(t);
  }, [justSubscribed]);

  return (
    <Ctx.Provider value={{ state, showBell: config.showBell, subscribe, justSubscribed }}>
      {children}
      {justSubscribed && typeof document !== "undefined" && createPortal(
        <div role="status" className="fixed bottom-5 left-1/2 z-[1500] flex -translate-x-1/2 items-center gap-2 rounded-full bg-storefront-green px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          <CheckCircle2 className="h-4 w-4" /> Notifications enabled!
        </div>, document.body)}
    </Ctx.Provider>
  );
}

/**
 * The bell: shown only while the visitor isn't subscribed. Tapping it asks for
 * permission; when notifications are blocked it explains how to unblock them.
 */
export function PushBell({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  const { state, showBell, subscribe } = usePush();
  const [help, setHelp] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!help) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left + r.width / 2 - 140, window.innerWidth - 288)) });
    const close = () => setHelp(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [help]);

  if (!showBell || (state !== "default" && state !== "denied")) return null;
  const denied = state === "denied";
  return (
    <>
      <button ref={btn} type="button" onClick={() => (denied ? setHelp((h) => !h) : void subscribe())}
        aria-label={denied ? "Notifications are blocked" : "Get notifications"} title={denied ? "Notifications are blocked" : "Get notifications"}
        className={cn("relative inline-flex shrink-0 items-center justify-center", className)}>
        {denied ? <BellOff className={iconClassName} strokeWidth={1.8} /> : <Bell className={cn("origin-top animate-[pm-ring_2.4s_ease-in-out_3]", iconClassName)} strokeWidth={1.8} />}
        {!denied && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#e53935]" aria-hidden />}
        <style>{"@keyframes pm-ring{0%,60%,100%{transform:rotate(0)}10%,30%{transform:rotate(14deg)}20%,40%{transform:rotate(-14deg)}}"}</style>
      </button>
      {help && pos && createPortal(
        <div role="dialog" aria-label="Notifications blocked" className="fixed z-[1600] w-[280px] rounded-xl border border-storefront-border bg-white p-3.5 text-sm text-storefront-text shadow-xl"
          style={{ top: pos.top, left: pos.left }}>
          <button type="button" onClick={() => setHelp(false)} aria-label="Close" className="absolute right-2 top-2 rounded p-1 text-storefront-muted hover:bg-storefront-bg"><X className="h-3.5 w-3.5" /></button>
          <p className="mb-1 pr-5 font-bold">Notifications are blocked</p>
          <p className="text-[13px] text-storefront-muted">Tap the 🔒 icon next to the web address, allow <b>Notifications</b>, then reload the page.</p>
        </div>, document.body)}
    </>
  );
}
