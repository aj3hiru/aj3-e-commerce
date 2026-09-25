"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, CloudUpload, Loader2, RotateCcw, Trash2, Wifi, X } from "lucide-react";
import { QUEUE_EVENT, readQueue, removeBill, retryBill, syncQueue, type QueuedBill } from "@/lib/pos-offline";
import { cn } from "@/lib/utils";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Keeps the billing page (and its scripts) on this computer, so it opens even with no internet. */
function useOfflinePage() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const scope = window.location.pathname.replace(/\/$/, "");
    navigator.serviceWorker.register("/pos-sw.js", { scope }).then(async (reg) => {
      await navigator.serviceWorker.ready;
      // Hand over everything this page has already loaded, so it's all there next time.
      const urls = performance.getEntriesByType("resource").map((e) => e.name)
        .filter((u) => u.startsWith(location.origin) && /\/_next\/static\/|\/uploads\//.test(u));
      (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "precache", urls: [...new Set(urls)], page: location.pathname + location.search });
    }).catch(() => { /* not supported here — billing still works online */ });
  }, []);
}

export function PosOfflineBar({ notice, onNoticeDone }: { notice: string | null; onNoticeDone: () => void }) {
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedBill[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loginNeeded, setLoginNeeded] = useState(false);
  const [open, setOpen] = useState(false);
  useOfflinePage();

  const refresh = useCallback(() => setQueue(readQueue()), []);
  const sync = useCallback(async () => {
    if (!navigator.onLine || !readQueue().some((b) => !b.failed)) return;
    setSyncing(true);
    try { setLoginNeeded((await syncQueue()).loginNeeded); } finally { setSyncing(false); refresh(); }
  }, [refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    const up = () => { setOnline(true); void sync(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener(QUEUE_EVENT, refresh);
    window.addEventListener("storage", refresh); // another tab changed the queue
    void sync();
    const t = setInterval(() => void sync(), 20_000);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); window.removeEventListener(QUEUE_EVENT, refresh); window.removeEventListener("storage", refresh); clearInterval(t); };
  }, [refresh, sync]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(onNoticeDone, 6000);
    return () => clearTimeout(t);
  }, [notice, onNoticeDone]);

  const waiting = queue.filter((b) => !b.failed);
  const failed = queue.filter((b) => b.failed);
  if (online && queue.length === 0 && !notice) return null;

  return (
    <div className="mb-4 space-y-2">
      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-[10px] border border-[#fcd34d] bg-[#fffbeb] px-4 py-2.5 text-[13.5px] text-[#92400e]">
          <CloudOff className="h-4 w-4 shrink-0" /><span className="flex-1">{notice}</span>
          <button type="button" onClick={onNoticeDone} aria-label="Close" className="grid h-6 w-6 place-items-center rounded-[6px] hover:bg-[#fef3c7]"><X className="h-4 w-4" /></button>
        </div>
      )}
      {(!online || queue.length > 0) && (
        <div className={cn("rounded-[10px] border px-4 py-2.5 text-[13.5px]", !online ? "border-[#fca5a5] bg-[#fef2f2] text-[#991b1b]" : failed.length ? "border-[#fca5a5] bg-[#fff7f7] text-[#991b1b]" : "border-[#bfdbfe] bg-[#eff6ff] text-[#1e3a8a]")}>
          <div className="flex flex-wrap items-center gap-2">
            {online ? <Wifi className="h-4 w-4 shrink-0" /> : <CloudOff className="h-4 w-4 shrink-0" />}
            <span className="flex-1 font-medium">
              {!online ? "No internet — keep billing. Bills are saved on this computer and upload by themselves." : "Back online."}
              {waiting.length > 0 && <> {waiting.length} bill{waiting.length === 1 ? "" : "s"} waiting to upload ({money(waiting.reduce((s, b) => s + b.summary.total, 0))}).</>}
              {failed.length > 0 && <> {failed.length} bill{failed.length === 1 ? "" : "s"} need{failed.length === 1 ? "s" : ""} a look.</>}
              {loginNeeded && <> Your login has ended — log in again to upload.</>}
            </span>
            {queue.length > 0 && <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-[8px] px-2.5 py-1 font-medium underline-offset-2 hover:underline">{open ? "Hide" : "Show"} bills</button>}
            {online && waiting.length > 0 && (
              <button type="button" onClick={() => void sync()} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#2563eb] px-3 py-1.5 font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}Upload now
              </button>
            )}
          </div>
          {open && queue.length > 0 && (
            <ul className="mt-2 divide-y divide-black/5 rounded-[8px] bg-white/70">
              {queue.map((b) => (
                <li key={b.ref} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px] text-[#374151]">
                  <span className="min-w-[150px] flex-1">
                    <b className="font-semibold">{b.summary.customer}</b> · {b.summary.items} item{b.summary.items === 1 ? "" : "s"} · {money(b.summary.total)}
                    <span className="block text-[12px] text-[#6b7280]">{new Date(b.soldAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })} · {b.ref.slice(-10).toUpperCase()}{b.lastError ? ` · ${b.lastError}` : ""}</span>
                  </span>
                  {b.failed && <button type="button" onClick={() => { retryBill(b.ref); void sync(); }} className="inline-flex items-center gap-1 rounded-[8px] border border-[#e5e7eb] bg-white px-2.5 py-1 text-[12.5px] font-medium hover:bg-[#f9fafb]"><RotateCcw className="h-3.5 w-3.5" />Retry</button>}
                  {b.failed && (
                    <button type="button" onClick={() => { if (confirm("Remove this bill from the upload list? It will NOT be saved to the system.")) removeBill(b.ref); }}
                      className="inline-flex items-center gap-1 rounded-[8px] border border-[#fecaca] bg-white px-2.5 py-1 text-[12.5px] font-medium text-[#b91c1c] hover:bg-[#fef2f2]"><Trash2 className="h-3.5 w-3.5" />Remove</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
