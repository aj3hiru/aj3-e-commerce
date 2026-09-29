"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudUpload, DatabaseBackup, Download, HardDriveDownload, Loader2, RotateCcw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BackupFile { name: string; size: number; createdAt: string; kind: "manual" | "safety" | "uploaded" }
interface LogLine { at: string; text: string; level: "info" | "ok" | "warn" | "error" }
interface Job { id: string; kind: "backup" | "validate" | "restore"; file: string | null; status: "running" | "done" | "failed"; percent: number; step: string; log: LogLine[]; logTotal: number; result?: { tables?: Record<string, number>; createdAt?: string } }

const mb = (n: number) => `${(n / 1048576).toFixed(n < 10485760 ? 2 : 1)} MB`;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const CHUNK = 900 * 1024; // stays under web-server upload limits

export function BackupView({ initial, runningJob }: { initial: BackupFile[]; runningJob: string | null }) {
  const [backups, setBackups] = useState(initial);
  const [jobId, setJobId] = useState<string | null>(runningJob);
  const [job, setJob] = useState<Job | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [upload, setUpload] = useState<{ name: string; pct: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmFile, setConfirmFile] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [validated, setValidated] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshList = useCallback(async () => {
    const r = await fetch("/api/system/backup", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.success) setBackups(r.backups);
  }, []);

  // Follow the running job: progress and new log lines every second.
  useEffect(() => {
    if (!jobId) return;
    let stop = false, from = 0;
    setLog([]);
    (async () => {
      while (!stop) {
        const r = await fetch(`/api/system/backup?job=${jobId}&from=${from}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
        if (stop) return;
        if (r?.success) {
          const j = r.job as Job;
          from = j.logTotal;
          setJob(j);
          if (j.log.length) setLog((l) => [...l, ...j.log].slice(-1500));
          if (j.status !== "running") {
            if (j.kind === "validate" && j.file) setValidated((v) => ({ ...v, [j.file!]: j.status === "done" }));
            void refreshList();
            return;
          }
        }
        await new Promise((res) => setTimeout(res, 1000));
      }
    })();
    return () => { stop = true; };
  }, [jobId, refreshList]);


  async function act(body: Record<string, unknown>) {
    setError(null);
    const r = await fetch("/api/system/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    if (!r?.success) { setError(r?.message || "Couldn't reach the server."); return false; }
    if (r.job) { setJob(null); setJobId(r.job); }
    else void refreshList();
    return true;
  }

  async function uploadFile(f: File) {
    if (!/\.(tar\.gz|tgz)$/i.test(f.name)) { setError("Choose a backup file made here (.tar.gz)."); return; }
    setError(null);
    const id = crypto.randomUUID();
    const total = Math.max(1, Math.ceil(f.size / CHUNK));
    setUpload({ name: f.name, pct: 0 });
    for (let i = 0; i < total; i++) {
      const body = f.slice(i * CHUNK, (i + 1) * CHUNK);
      let r = null;
      for (let attempt = 0; attempt < 4 && !r?.success; attempt++) {
        r = await fetch("/api/system/backup/upload", {
          method: "POST", body,
          headers: { "x-upload-id": id, "x-chunk": String(i), "x-chunks": String(total), "x-file-name": encodeURIComponent(f.name), "Content-Type": "application/octet-stream" },
        }).then((x) => x.json()).catch(() => null);
        if (!r?.success && attempt < 3) await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      }
      if (!r?.success) { setUpload(null); setError(r?.message || "Upload failed — check the connection and try again."); return; }
      setUpload({ name: f.name, pct: Math.round(((i + 1) / total) * 100) });
      if (r.done) { setJob(null); setJobId(r.job); }
    }
    setUpload(null);
    void refreshList();
  }

  const busy = job?.status === "running" || !!upload;
  const running = job?.status === "running";
  const tone = job?.status === "failed" ? "bg-red-500" : job?.status === "done" ? "bg-emerald-500" : "bg-admin-primary";

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-500">✕</button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-admin-primary-lighter text-admin-primary"><DatabaseBackup className="h-5 w-5" /></span>
            <div className="flex-1">
              <h2 className="text-[15px] font-semibold text-admin-gray-900">Create a backup</h2>
              <p className="mt-0.5 text-sm text-admin-gray-500">A complete, secure copy of your store — products, orders, customers, payments, staff, settings, push notification subscribers and keys, and every uploaded image — saved as a single file you can download or restore at any time.</p>
            </div>
          </div>
          <button type="button" disabled={busy} onClick={() => act({ action: "backup" })}
            className="mt-4 flex h-10 items-center gap-2 rounded-lg bg-admin-primary px-4 text-sm font-semibold text-white hover:bg-admin-primary-dark disabled:opacity-50">
            {running && job?.kind === "backup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />} Back up now
          </button>
        </section>

        <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><CloudUpload className="h-5 w-5" /></span>
            <div className="flex-1">
              <h2 className="text-[15px] font-semibold text-admin-gray-900">Upload a backup</h2>
              <p className="mt-0.5 text-sm text-admin-gray-500">Restore your store from a backup saved on your computer. Every file is checked for damage and unsafe content before it can be used.</p>
            </div>
          </div>
          <input ref={fileInput} type="file" accept=".gz,.tgz,application/gzip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadFile(f); }} />
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}
            className="mt-4 flex h-10 items-center gap-2 rounded-lg border border-admin-gray-200 bg-white px-4 text-sm font-semibold text-admin-gray-800 hover:bg-admin-gray-50 disabled:opacity-50">
            <CloudUpload className="h-4 w-4" /> Choose file…
          </button>
          {upload && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-admin-gray-600"><span className="truncate">Uploading {upload.name}</span><span>{upload.pct}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-admin-gray-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${upload.pct}%` }} /></div>
            </div>
          )}
        </section>
      </div>

      {job && (
        <section className="overflow-hidden rounded-xl border border-admin-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 px-5 pt-4">
            {job.status === "running" ? <Loader2 className="h-5 w-5 animate-spin text-admin-primary" /> : job.status === "done" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-admin-gray-900">{job.kind === "backup" ? "Backing up" : job.kind === "validate" ? "Scanning backup file" : "Restoring"}{job.file ? ` · ${job.file}` : ""}</p>
              <p className="truncate text-xs text-admin-gray-500">{job.step}</p>
            </div>
            <span className="text-2xl font-bold tabular-nums text-admin-gray-900">{job.percent}%</span>
          </div>
          <div className="mx-5 mt-3 h-3 overflow-hidden rounded-full bg-admin-gray-100">
            <div className={cn("relative h-full rounded-full transition-all duration-500", tone)} style={{ width: `${job.percent}%` }}>
              {job.status === "running" && <span className="absolute inset-0 animate-[bk-stripes_1s_linear_infinite] bg-[length:24px_24px] bg-[linear-gradient(45deg,rgba(255,255,255,.28)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.28)_50%,rgba(255,255,255,.28)_75%,transparent_75%)]" />}
            </div>
          </div>
          {/* Latest steps (newest first); the full record opens below — no scrolling box inside the page. */}
          <ul className="mt-4 space-y-1.5 border-t border-admin-gray-100 px-5 py-4">
            {(showAll ? [...log].reverse() : [...log].reverse().slice(0, 5)).map((l, i) => (
              <li key={`${l.at}-${i}`} className="flex items-start gap-2.5 text-[13px]">
                <span className={cn("mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full",
                  l.level === "ok" ? "bg-emerald-100 text-emerald-600" : l.level === "error" ? "bg-red-100 text-red-600" : l.level === "warn" ? "bg-amber-100 text-amber-600" : "bg-admin-gray-100 text-admin-gray-500")}>
                  {l.level === "ok" ? <CheckCircle2 className="h-3 w-3" /> : l.level === "error" ? <XCircle className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <span className={cn("min-w-0 flex-1 break-words", l.level === "error" ? "text-red-700" : l.level === "ok" ? "text-admin-gray-900" : "text-admin-gray-600")}>{l.text.trim()}</span>
                <span className="shrink-0 text-xs tabular-nums text-admin-gray-400">{new Date(l.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
              </li>
            ))}
            {log.length > 5 && (
              <li><button type="button"onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-admin-primary">{showAll ? "Show fewer steps": `Show all ${log.length} steps`}</button></li>
            )}
          </ul>
          <style>{"@keyframes bk-stripes{from{background-position:0 0}to{background-position:24px 0}}"}</style>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-admin-gray-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-admin-gray-100 px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-admin-gray-900">Backups on the server</h2>
          <span className="text-xs text-admin-gray-500">{backups.length} file{backups.length === 1 ? "" : "s"}</span>
        </header>
        {backups.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-admin-gray-500">No backups yet. Click “Back up now” to make the first one.</p>
        ) : (
          <div className="divide-y divide-admin-gray-100">
            {backups.map((b) => (
              <div key={b.name} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-admin-gray-900">{b.name}</p>
                  <p className="text-xs text-admin-gray-500">
                    {when(b.createdAt)} · {mb(b.size)}
                    {b.kind === "safety" && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">Made before a restore</span>}
                    {b.kind === "uploaded" && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700">Uploaded</span>}
                    {validated[b.name] === true && <span className="ml-2 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700"><ShieldCheck className="h-3 w-3" /> Checked</span>}
                  </p>
                </div>
                <a href={`/api/system/backup/download?file=${encodeURIComponent(b.name)}`} className="flex h-8 items-center gap-1.5 rounded-md border border-admin-gray-200 px-2.5 text-xs font-medium text-admin-gray-700 hover:bg-admin-gray-50"><Download className="h-3.5 w-3.5" /> Download</a>
                <button type="button" disabled={busy} onClick={() => act({ action: "validate", file: b.name })} className="flex h-8 items-center gap-1.5 rounded-md border border-admin-gray-200 px-2.5 text-xs font-medium text-admin-gray-700 hover:bg-admin-gray-50 disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" /> Scan</button>
                <button type="button" disabled={busy} onClick={() => { setConfirmFile(b.name); setTyped(""); }} className="flex h-8 items-center gap-1.5 rounded-md bg-amber-500 px-2.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Restore</button>
                <button type="button" disabled={busy} onClick={() => window.confirm(`Delete ${b.name}? This can't be undone.`) && act({ action: "delete", file: b.name })} aria-label={`Delete ${b.name}`} className="grid h-8 w-8 place-items-center rounded-md border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {confirmFile && (
        <div className="fixed inset-0 z-[1500] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Confirm restore">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600"><AlertTriangle className="h-5 w-5" /></span>
              <div>
                <h3 className="text-base font-semibold text-admin-gray-900">Restore this backup?</h3>
                <p className="mt-1 text-sm text-admin-gray-600">Everything on the site — products, orders, customers, settings and uploaded images — will be replaced with <b>{confirmFile}</b>. A safety backup of the site as it is now is saved first, so you can undo.</p>
              </div>
            </div>
            <label className="mt-4 block text-sm text-admin-gray-700">Type <b>RESTORE</b> to continue
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus className="mt-1 h-10 w-full rounded-lg border border-admin-gray-200 px-3 text-sm outline-none focus:border-admin-primary" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmFile(null)} className="h-9 rounded-lg border border-admin-gray-200 px-4 text-sm font-medium">Cancel</button>
              <button type="button" disabled={typed !== "RESTORE"} onClick={async () => { const f = confirmFile; setConfirmFile(null); await act({ action: "restore", file: f, confirm: "RESTORE" }); }}
                className="h-9 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-white disabled:opacity-50">Restore now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
