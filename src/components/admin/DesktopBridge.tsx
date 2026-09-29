"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CloudOff, CloudUpload, Download, Loader2, RotateCcw, Trash2, Wifi, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Only inside the Windows desktop app (Tauri — desktop/ in this repo):
 *  - registers desktop-sw.js: every admin page and its data also open offline,
 *    changes made offline are queued and sent when the internet is back;
 *  - online / offline chip with what is waiting to be sent (and anything the
 *    server refused, to retry or discard);
 *  - saves the sidebar's pages in the background while online;
 *  - tells the user when a new version of the app is out.
 * In a normal browser it renders nothing and does nothing.
 */

type Tauri = {
  notification?: { sendNotification(o: { title: string; body?: string }): void; isPermissionGranted(): Promise<boolean>; requestPermission(): Promise<string> };
  window?: { getCurrentWindow(): { requestUserAttention(t: number | null): Promise<void>; isFocused(): Promise<boolean> } };
  app?: { getVersion(): Promise<string> };
  opener?: { openUrl(url: string): Promise<void> };
};
const tauri = (): Tauri | null => (typeof window !== "undefined" && (window as unknown as { __TAURI__?: Tauri }).__TAURI__) || null;
export const isDesktopApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Windows notification + taskbar flash (desktop app only). Returns false when not in the app. */
export async function desktopNotify(title: string, body: string): Promise<boolean> {
  const t = tauri();
  if (!t?.notification) return false;
  try {
    let ok = await t.notification.isPermissionGranted();
    if (!ok) ok = (await t.notification.requestPermission()) === "granted";
    if (ok) t.notification.sendNotification({ title, body });
    await t.window?.getCurrentWindow().requestUserAttention(2).catch(() => {}); // flash the taskbar button
    return true;
  } catch {
    return false;
  }
}

interface Item { id: string; label: string; at: number; message?: string }
const when = (at: number) => new Date(at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const newer = (a: string, b: string) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

export function DesktopBridge() {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<Item[]>([]);
  const [failed, setFailed] = useState<Item[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null);
  const onlineRef = useRef(true);

  const post = useCallback((msg: unknown) => navigator.serviceWorker?.controller?.postMessage(msg), []);

  useEffect(() => {
    if (!isDesktopApp() || !("serviceWorker" in navigator)) return;
    setOn(true);
    let stop = false;
    navigator.serviceWorker.register("/desktop-sw.js", { scope: "/" }).then(() => navigator.serviceWorker.ready).then(() => post({ type: "status" })).catch(() => {});

    const onMsg = (e: MessageEvent) => {
      const d = e.data || {};
      if (d.type !== "queue") return;
      setPending(d.pending || []);
      setFailed(d.failed || []);
      setSyncing(!!d.syncing);
      if (d.synced) {
        setToast(`${d.synced} change${d.synced === 1 ? "" : "s"} made offline ${d.synced === 1 ? "was" : "were"} sent to the server.`);
        router.refresh();
      }
      if (d.note === "signin") setToast("Please sign in again — then the offline changes will be sent.");
    };
    navigator.serviceWorker.addEventListener("message", onMsg);

    // Really online = the server answers (Wi-Fi can be "connected" without internet).
    const check = async () => {
      let ok = navigator.onLine;
      if (ok) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 5000);
        ok = await fetch("/api/health", { cache: "no-store", signal: ctl.signal }).then((r) => r.ok).catch(() => false);
        clearTimeout(t);
      }
      if (stop) return;
      const was = onlineRef.current;
      onlineRef.current = ok;
      setOnline(ok);
      if (ok) post({ type: "sync" });
      if (ok && !was) router.refresh();
    };
    const warm = () => {
      if (!onlineRef.current) return;
      const urls = new Set<string>([location.href]);
      document.querySelectorAll<HTMLAnchorElement>("aside a[href], nav a[href]").forEach((a) => {
        const u = new URL(a.href, location.href);
        if (u.origin === location.origin && !u.pathname.startsWith("/api/") && !/logout/i.test(u.pathname)) urls.add(u.origin + u.pathname + u.search);
      });
      post({ type: "warm", urls: [...urls] });
    };
    void check();
    const tick = setInterval(check, 15_000);
    const w1 = setTimeout(warm, 8_000);
    const w2 = setInterval(warm, 10 * 60_000);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);

    // A newer version of the app (the pages themselves are always the live website — only the app shell updates).
    (async () => {
      try {
        const [mine, latest] = await Promise.all([
          tauri()?.app?.getVersion() ?? Promise.resolve(""),
          fetch("/app/desktop-latest.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (mine && latest?.version && latest?.url && newer(latest.version, mine)) setUpdate({ version: latest.version, url: latest.url });
      } catch { /* offline */ }
    })();

    return () => {
      stop = true;
      clearInterval(tick); clearTimeout(w1); clearInterval(w2);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
      navigator.serviceWorker.removeEventListener("message", onMsg);
    };
  }, [post, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!on) return null;
  const waiting = pending.length;
  const tone = !online ? "offline" : failed.length ? "failed" : waiting || syncing ? "sending" : "online";

  return createPortal(
    <>
      <div className="fixed bottom-3 left-3 z-[1900] flex flex-col items-start gap-2">
        {update && (
          <div className="flex items-center gap-2 rounded-md border border-admin-gray-200 bg-white px-3 py-2 text-[13px] shadow-lg">
            <Download className="h-4 w-4 text-admin-primary" />
            <span>New version {update.version} of the app</span>
            <button type="button" onClick={() => void tauri()?.opener?.openUrl(update.url)} className="rounded bg-admin-primary px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 active:opacity-80">Download</button>
            <button type="button" onClick={() => setUpdate(null)} aria-label="Later" className="rounded p-0.5 text-admin-gray-400 hover:bg-admin-gray-100"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} title={online ? "Connected" : "Offline — changes are kept on this computer and sent automatically"}
          className={cn("flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98]",
            tone === "online" && "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50",
            tone === "sending" && "border-sky-200 bg-sky-50 text-sky-700",
            tone === "failed" && "border-red-200 bg-red-50 text-red-700",
            tone === "offline" && "border-amber-300 bg-amber-50 text-amber-800")}>
          {tone === "offline" ? <CloudOff className="h-3.5 w-3.5" /> : tone === "sending" ? (syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />) : tone === "failed" ? <CloudUpload className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
          {tone === "offline" ? `Offline${waiting ? ` · ${waiting} waiting` : " — changes will sync"}` : tone === "sending" ? `Sending ${waiting}…` : tone === "failed" ? `${failed.length} not sent` : "Online"}
        </button>
      </div>

      {open && (
        <div className="fixed bottom-12 left-3 z-[1901] w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-md border border-admin-gray-200 bg-white text-[13px] shadow-[0_8px_28px_rgba(0,0,0,.18)]" role="dialog" aria-label="Sync status">
          <div className="flex items-center justify-between border-b border-admin-gray-100 px-3 py-2">
            <b className="font-semibold text-admin-gray-900">{online ? "Connected to the server" : "Working offline"}</b>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-admin-gray-400 hover:bg-admin-gray-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto px-3 py-2">
            {!online && <p className="mb-2 text-admin-gray-600">Pages open from the copy saved on this computer. Anything you change is kept here and sent automatically when the internet is back.</p>}
            {!waiting && !failed.length && <p className="py-2 text-admin-gray-500">Everything is sent — nothing waiting.</p>}
            {waiting > 0 && <p className="mb-1 mt-1 text-[11px] font-bold uppercase tracking-wide text-admin-gray-400">Waiting to send ({waiting})</p>}
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 border-b border-admin-gray-50 py-1.5 last:border-0">
                <span className="truncate">{p.label}</span><span className="shrink-0 text-xs text-admin-gray-400">{when(p.at)}</span>
              </div>
            ))}
            {failed.length > 0 && <p className="mb-1 mt-2 text-[11px] font-bold uppercase tracking-wide text-red-500">The server didn&rsquo;t accept ({failed.length})</p>}
            {failed.map((f) => (
              <div key={f.id} className="border-b border-admin-gray-50 py-1.5 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{f.label}</span>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" title="Try again" onClick={() => post({ type: "retry", id: f.id })} className="rounded p-1 text-admin-gray-500 hover:bg-admin-gray-100"><RotateCcw className="h-3.5 w-3.5" /></button>
                    <button type="button" title="Discard" onClick={() => post({ type: "discard", id: f.id })} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
                <p className="text-xs text-red-600">{f.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && <div role="status" className="fixed bottom-12 left-3 z-[1902] max-w-sm rounded-md bg-admin-gray-900 px-3 py-2 text-[13px] text-white shadow-lg">{toast}</div>}
    </>,
    document.body,
  );
}
