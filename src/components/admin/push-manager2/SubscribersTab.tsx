"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, Trash2, Upload, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { PushBrowser } from "@/lib/push-subscriptions";
import { BTN_OUTLINE, BTN_PRIMARY, CARD, ConfirmDialog, Modal, Pager, RowMenu, when } from "./ui";

export interface SubscriberRow { id: number; host: string; browser: PushBrowser; browserLabel: string; createdAt: string }
export interface SubscribersData {
  rows: SubscriberRow[]; total: number; page: number; pageCount: number; pageSize: number; newThisWeek: number;
  breakdown: { browser: PushBrowser; label: string; count: number }[];
}

const BROWSER_COLOR: Record<PushBrowser, string> = {
  chrome: "#2563eb", firefox: "#f97316", safari: "#0ea5e9", edge: "#14b8a6", other: "#94a3b8",
};

export const EVT_IMPORT = "push2:import";

export function exportSubscribers(format: "csv" | "json") {
  window.location.href = `/api/push2/subscribers/export?format=${format}`;
}

/** Subscribers: who can receive pushes, by browser — plus import/export and removal. */
export function SubscribersTab({ data, onPage, onChanged, onError }: {
  data: SubscribersData; onPage: (p: number) => void; onChanged: (text: string) => void; onError: (text: string) => void;
}) {
  const { isVisible: show } = useDashboardWidgetPrefs();
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<SubscriberRow | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    const open = () => setImportOpen(true);
    window.addEventListener(EVT_IMPORT, open);
    return () => window.removeEventListener(EVT_IMPORT, open);
  }, []);

  async function remove(r: SubscriberRow) {
    setConfirm(null);
    setBusy(r.id);
    const res = await fetch(`/api/push2/subscribers/${r.id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => ({ success: false }));
    setBusy(null);
    if (res.success) onChanged("Subscriber removed.");
    else onError(res.error ?? "Couldn't remove this subscriber.");
  }

  const max = Math.max(1, ...data.breakdown.map((b) => b.count));
  const first = (data.page - 1) * data.pageSize + 1;

  return (
    <div className="space-y-5">
      {(show("pm2-s-breakdown") || show("pm2-s-tools")) && (
        <div className={cn("grid grid-cols-1 gap-5", show("pm2-s-breakdown") && show("pm2-s-tools") && "lg:grid-cols-[minmax(0,1fr)_340px]")}>
          {show("pm2-s-breakdown") && (
            <section className={cn(CARD, "p-5")}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-admin-gray-900">Subscribers by browser</h2>
                <span className="text-sm text-admin-gray-500"><b className="text-admin-gray-900">{formatInt(data.total)}</b> total · <b className="text-emerald-600">+{formatInt(data.newThisWeek)}</b> this week</span>
              </div>
              <div className="space-y-3">
                {data.breakdown.filter((b) => b.count > 0 || b.browser !== "other").map((b) => (
                  <div key={b.browser} className="grid grid-cols-[130px_minmax(0,1fr)_60px] items-center gap-3 text-sm">
                    <span className="truncate text-admin-gray-700">{b.label}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-admin-gray-100">
                      <span className="block h-full rounded-full" style={{ width: `${(b.count / max) * 100}%`, background: BROWSER_COLOR[b.browser] }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums text-admin-gray-900">{formatInt(b.count)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {show("pm2-s-tools") && (
            <section className={cn(CARD, "flex flex-col gap-3 p-5")}>
              <h2 className="text-base font-bold text-admin-gray-900">Import / Export</h2>
              <p className="text-xs text-admin-gray-500">Move subscribers between servers or back them up. Imported subscribers only receive pushes if they were created with the <b>same VAPID keys</b> as this site.</p>
              <button type="button" onClick={() => setImportOpen(true)} className={BTN_PRIMARY}><Upload className="h-4 w-4" /> Import Subscribers</button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => exportSubscribers("csv")} disabled={data.total === 0} className={BTN_OUTLINE}><Download className="h-4 w-4" /> CSV</button>
                <button type="button" onClick={() => exportSubscribers("json")} disabled={data.total === 0} className={BTN_OUTLINE}><Download className="h-4 w-4" /> JSON</button>
              </div>
            </section>
          )}
        </div>
      )}

      {show("pm2-s-table") && (
        data.total === 0 ? (
          <div className={cn(CARD, "px-4 py-14 text-center text-admin-gray-500")}>
            <Users className="mx-auto mb-3 h-12 w-12 text-admin-gray-300" />
            <h3 className="mb-1 text-lg font-semibold text-admin-gray-800">No subscribers yet</h3>
            <p className="text-sm">Shoppers subscribe from the &quot;Allow Notifications&quot; prompt on your store — or import an existing list.</p>
          </div>
        ) : (
          <section className={cn(CARD, "overflow-hidden")}>
            <div className="flex items-center justify-between border-b border-admin-gray-100 px-5 py-3 text-sm text-admin-gray-600">
              <span className="font-semibold text-admin-gray-900">Subscriber list</span>
              <span>Showing {first} to {first + data.rows.length - 1} of {formatInt(data.total)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-admin-gray-50 text-xs font-semibold uppercase tracking-wide text-admin-gray-500">
                  <tr><th className="px-5 py-2.5">#</th><th className="px-5 py-2.5">Browser</th><th className="hidden px-5 py-2.5 sm:table-cell">Push service</th><th className="px-5 py-2.5">Subscribed</th><th className="px-5 py-2.5 text-right" /></tr>
                </thead>
                <tbody className="divide-y divide-admin-gray-100">
                  {data.rows.map((r) => (
                    <tr key={r.id} className={cn("hover:bg-admin-gray-50/60", busy === r.id && "opacity-50")}>
                      <td className="px-5 py-2.5 tabular-nums text-admin-gray-500">{r.id}</td>
                      <td className="px-5 py-2.5"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BROWSER_COLOR[r.browser] }} />{r.browserLabel}</span></td>
                      <td className="hidden px-5 py-2.5 font-mono text-xs text-admin-gray-500 sm:table-cell">{r.host}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-xs text-admin-gray-500">{when(r.createdAt)}</td>
                      <td className="px-5 py-2.5 text-right">
                        <RowMenu label="Subscriber actions" disabled={busy === r.id} items={[{ label: "Remove", icon: Trash2, danger: true, onClick: () => setConfirm(r) }]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}

      {show("pm2-s-pager") && <Pager page={data.page} pageCount={data.pageCount} onPage={onPage} label="Subscriber pages" />}

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={(text) => { setImportOpen(false); onChanged(text); }} />}
      {confirm && (
        <ConfirmDialog icon={<Trash2 className="h-6 w-6" />} tone="red" title="Remove subscriber?"
          text={<>{confirm.browserLabel} subscriber #{confirm.id} will stop receiving notifications. They can subscribe again from the store.</>}
          confirmLabel="Remove" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />
      )}
    </div>
  );
}

type ImportResult = { total: number; added: number; updated: number; unchanged: number; invalid: number; duplicates: number };

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined | null) {
    setErr(null); setResult(null);
    if (!f) return;
    if (!/\.(csv|json|txt)$/i.test(f.name)) { setErr("Choose a .csv or .json file."); return; }
    if (f.size > 10 * 1024 * 1024) { setErr("File is too large (max 10MB)."); return; }
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/push2/subscribers/import", { method: "POST", body: fd }).then((r) => r.json()).catch(() => ({ success: false, error: "Network error — please try again." }));
    setBusy(false);
    if (res.success) setResult(res);
    else setErr(res.error ?? "Import failed.");
  }

  return (
    <Modal title="Import subscribers" onClose={busy ? () => {} : onClose} size="md"
      footer={
        <div className="flex justify-end gap-2">
          {result ? (
            <button type="button" onClick={() => onDone(`Import finished: ${formatInt(result.added)} added, ${formatInt(result.updated)} updated.`)} className={BTN_PRIMARY}>Done</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-sm font-medium text-white hover:bg-[#5c636a] disabled:opacity-60">Cancel</button>
              <button type="button" onClick={upload} disabled={!file || busy} className={BTN_PRIMARY}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : <><Upload className="h-4 w-4" /> Import</>}
              </button>
            </>
          )}
        </div>
      }>
      <div className="space-y-4 p-5">
        {!result && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
              onClick={() => input.current?.click()} role="button" tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
              className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-[0.5rem] border-2 border-dashed px-4 py-8 text-center transition-colors",
                drag ? "border-[#2563eb] bg-blue-50" : "border-[#cbd5e1] hover:border-[#2563eb] hover:bg-admin-gray-50")}>
              <FileUp className="h-8 w-8 text-[#2563eb]" />
              {file ? <span className="text-sm font-semibold text-admin-gray-900">{file.name} <span className="font-normal text-admin-gray-500">({(file.size / 1024).toFixed(1)} KB)</span></span>
                : <span className="text-sm text-admin-gray-700"><b className="text-[#2563eb]">Choose a file</b> or drag it here</span>}
              <span className="text-xs text-admin-gray-500">CSV or JSON, up to 10MB</span>
              <input ref={input} type="file" accept=".csv,.json,.txt,text/csv,application/json" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </div>
            <div className="rounded-[0.375rem] bg-admin-gray-50 px-3 py-2.5 text-xs text-admin-gray-600">
              <p className="mb-1 font-semibold text-admin-gray-800">Accepted formats</p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>This page&apos;s own CSV / JSON export</li>
                <li>CSV with columns <code>endpoint,p256dh,auth</code></li>
                <li>The old PHP table&apos;s <code>subscription</code> JSON column</li>
              </ul>
              <p className="mt-1.5">Existing subscribers are matched by endpoint and updated; invalid rows are skipped.</p>
            </div>
            {err && <div role="alert" className="flex items-start gap-2 rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><X className="mt-0.5 h-4 w-4 shrink-0" />{err}</div>}
          </>
        )}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-5 w-5" /><b>Import complete</b> <span className="text-sm text-admin-gray-500">({formatInt(result.total)} rows read)</span></div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Stat label="Added" value={result.added} cls="text-emerald-600" />
              <Stat label="Updated" value={result.updated} cls="text-[#2563eb]" />
              <Stat label="Unchanged" value={result.unchanged} cls="text-admin-gray-700" />
              <Stat label="Duplicates in file" value={result.duplicates} cls="text-admin-gray-700" />
              <Stat label="Invalid (skipped)" value={result.invalid} cls={result.invalid ? "text-red-600" : "text-admin-gray-700"} />
            </div>
            {result.invalid > 0 && (
              <p className="flex items-start gap-2 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Invalid rows are missing keys or point to an unknown push service, and were not saved.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-[0.375rem] border border-admin-gray-200 px-3 py-2">
      <div className={cn("text-lg font-bold tabular-nums", cls)}>{formatInt(value)}</div>
      <div className="text-xs text-admin-gray-500">{label}</div>
    </div>
  );
}
