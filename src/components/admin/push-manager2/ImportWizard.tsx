"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Download, FileUp, Loader2, RotateCcw, ShieldCheck, Square, Upload, X, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";
import type { ImportAnalysis, ImportProgress } from "@/lib/push-import";
import { BTN_OUTLINE, BTN_PRIMARY, Modal } from "./ui";

/**
 * Subscriber import, in four steps:
 *   Upload  → real upload progress
 *   Review  → the server has verified every row (endpoint shape, a real P-256
 *             key, a 16-byte auth secret, duplicates) — nothing written yet
 *   Import  → verified rows written in chunks, with live % and bar graph; can stop
 *   Done    → final summary
 */

type Phase = "pick" | "uploading" | "verifying" | "review" | "importing" | "done" | "error";
const CHUNK = 250;

const COLORS = {
  add: "#16a34a", update: "#2563eb", same: "#94a3b8", reject: "#dc2626", dup: "#f59e0b",
};

export function ImportWizard({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<ImportAnalysis | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [stopped, setStopped] = useState(false);
  const [rate, setRate] = useState<number | null>(null); // rows per second
  const stopRef = useRef(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => xhrRef.current?.abort(), []);

  function pick(f: File | undefined | null) {
    setErr(null);
    if (!f) return;
    if (!/\.(csv|json|txt)$/i.test(f.name)) { setErr("Choose a .csv or .json file."); return; }
    if (f.size > 10 * 1024 * 1024) { setErr("File is too large (max 10MB)."); return; }
    setFile(f);
  }

  function analyze() {
    if (!file) return;
    setErr(null); setUploadPct(0); setPhase("uploading");
    const fd = new FormData();
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/push2/subscribers/import/analyze");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100)); };
    xhr.upload.onload = () => { setUploadPct(100); setPhase("verifying"); };
    xhr.onload = () => {
      let data: (ImportAnalysis & { success?: boolean; error?: string }) | null = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* handled below */ }
      if (data?.success) { setReport(data); setPhase("review"); }
      else { setErr(data?.error ?? "Couldn't check this file. Please try again."); setPhase("pick"); }
    };
    xhr.onerror = () => { setErr("Network error — please try again."); setPhase("pick"); };
    xhr.send(fd);
  }

  async function runImport() {
    if (!report) return;
    stopRef.current = false;
    setStopped(false); setErr(null); setPhase("importing");
    const started = Date.now();
    const startProcessed = progress?.processed ?? 0;
    let last: ImportProgress | null = progress;
    let failures = 0;
    while (!stopRef.current && !(last?.done)) {
      const res = await fetch("/api/push2/subscribers/import/commit", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: report.token, size: CHUNK }),
      }).then((r) => r.json()).catch(() => ({ success: false, error: "Network error." }));
      if (!res.success) {
        // A blip shouldn't end a long import: retry a few times with a pause.
        if (++failures <= 3 && res.error !== "This import has expired — please upload the file again.") { await new Promise((r) => setTimeout(r, 1000 * failures)); continue; }
        setErr(res.error ?? "Import stopped because of an error."); setPhase("error");
        return;
      }
      failures = 0;
      last = res as ImportProgress;
      setProgress(last);
      const secs = (Date.now() - started) / 1000;
      if (secs > 0.5) setRate((last.processed - startProcessed) / secs);
    }
    if (stopRef.current && !last?.done) setStopped(true);
    setPhase("done");
  }

  const importable = report ? report.willAdd + report.willUpdate : 0;
  const busy = phase === "uploading" || phase === "verifying" || phase === "importing";
  const pct = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const eta = rate && progress && rate > 0 ? Math.max(0, Math.ceil((progress.total - progress.processed) / rate)) : null;

  const close = () => {
    if (phase === "importing") { stopRef.current = true; return; } // stop first; the loop lands on "done"
    if (phase === "done" && progress) {
      onDone(`${stopped ? "Import stopped" : "Import finished"}: ${formatInt(progress.added)} added, ${formatInt(progress.updated)} updated.`);
      return;
    }
    xhrRef.current?.abort();
    onClose();
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {phase === "pick" && <>
        <button type="button" onClick={onClose} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
        <button type="button" onClick={analyze} disabled={!file} className={BTN_PRIMARY}><ShieldCheck className="h-4 w-4" /> Upload &amp; verify</button>
      </>}
      {(phase === "uploading" || phase === "verifying") && (
        <button type="button" onClick={() => { xhrRef.current?.abort(); setPhase("pick"); }} className={BTN_OUTLINE}>Cancel</button>
      )}
      {phase === "review" && report && <>
        <button type="button" onClick={() => { setReport(null); setProgress(null); setPhase("pick"); }} className={BTN_OUTLINE}><RotateCcw className="h-4 w-4" /> Choose another file</button>
        <button type="button" onClick={runImport} disabled={importable === 0} className={BTN_PRIMARY}>
          <Upload className="h-4 w-4" /> {importable === 0 ? "Nothing new to import" : `Import ${formatInt(importable)} verified subscriber${importable === 1 ? "" : "s"}`}
        </button>
      </>}
      {phase === "importing" && (
        <button type="button" onClick={() => { stopRef.current = true; }} className={cn(BTN_OUTLINE, "text-red-600")}><Square className="h-3.5 w-3.5 fill-current" /> Stop</button>
      )}
      {phase === "error" && <>
        <button type="button" onClick={onClose} className={BTN_OUTLINE}>Close</button>
        {report && progress && !progress.done && <button type="button" onClick={runImport} className={BTN_PRIMARY}><RotateCcw className="h-4 w-4" /> Resume import</button>}
      </>}
      {phase === "done" && <button type="button" onClick={close} className={BTN_PRIMARY}>Done</button>}
    </div>
  );

  return (
    <Modal title="Import subscribers" onClose={busy ? () => { if (phase === "importing") stopRef.current = true; } : close} size="lg" footer={footer}
      headerExtra={<Steps phase={phase} />}>
      <div className="space-y-5 p-5">
        {phase === "pick" && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
              onClick={() => input.current?.click()} role="button" tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
              className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
                drag ? "border-[#2563eb] bg-blue-50" : "border-[#cbd5e1] hover:border-[#2563eb] hover:bg-admin-gray-50")}>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-[#2563eb]"><FileUp className="h-7 w-7" /></span>
              {file ? <span className="text-sm font-semibold text-admin-gray-900">{file.name} <span className="font-normal text-admin-gray-500">({(file.size / 1024).toFixed(1)} KB)</span></span>
                : <span className="text-sm text-admin-gray-700"><b className="text-[#2563eb]">Choose a file</b> or drag it here</span>}
              <span className="text-xs text-admin-gray-500">CSV or JSON · up to 10MB · 100,000 rows</span>
              <input ref={input} type="file" accept=".csv,.json,.txt,text/csv,application/json" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[0.5rem] bg-admin-gray-50 px-3.5 py-3 text-xs text-admin-gray-600">
                <p className="mb-1.5 font-semibold text-admin-gray-800">Accepted formats</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  <li>This page&apos;s own CSV / JSON export</li>
                  <li>CSV with <code>endpoint,p256dh,auth</code></li>
                  <li>Old PHP table&apos;s <code>subscription</code> column</li>
                </ul>
              </div>
              <div className="rounded-[0.5rem] bg-emerald-50/60 px-3.5 py-3 text-xs text-emerald-900">
                <p className="mb-1.5 flex items-center gap-1 font-semibold"><ShieldCheck className="h-3.5 w-3.5" /> Every row is verified first</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  <li>Real browser push service &amp; endpoint format</li>
                  <li>Encryption key is a genuine P-256 key</li>
                  <li>Auth secret is exactly 16 bytes · no duplicates</li>
                </ul>
              </div>
            </div>
            {err && <div role="alert" className="flex items-start gap-2 rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><X className="mt-0.5 h-4 w-4 shrink-0" />{err}</div>}
          </>
        )}

        {(phase === "uploading" || phase === "verifying") && (
          <div className="py-6">
            <BigPercent value={phase === "uploading" ? uploadPct : 100} label={phase === "uploading" ? "Uploading" : "Verifying every row…"} />
            <ProgressBar pct={phase === "uploading" ? uploadPct : 100} active indeterminate={phase === "verifying"} />
            <p className="mt-3 text-center text-sm text-admin-gray-500">
              {phase === "uploading" ? `Sending ${file?.name}…` : "Checking endpoints, encryption keys and duplicates — nothing is saved yet."}
            </p>
          </div>
        )}

        {phase === "review" && report && <Review report={report} />}

        {(phase === "importing" || phase === "done" || phase === "error") && report && progress && (
          <div className="space-y-5">
            {phase === "done" && (
              <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", stopped ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
                {stopped ? <AlertTriangle className="h-6 w-6 shrink-0" /> : <CheckCircle2 className="h-6 w-6 shrink-0" />}
                <div className="text-sm"><b>{stopped ? "Import stopped" : "Import complete"}</b> — {formatInt(progress.processed)} of {formatInt(progress.total)} verified rows processed{stopped ? "; rows already imported are kept." : "."}</div>
              </div>
            )}
            {phase === "error" && err && <div role="alert" className="flex items-start gap-2 rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}</div>}
            <BigPercent value={pct} label={phase === "importing" ? "Importing" : "Processed"} />
            <ProgressBar pct={pct} active={phase === "importing"} />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-admin-gray-500">
              <span>{formatInt(progress.processed)} / {formatInt(progress.total)} rows</span>
              {phase === "importing" && rate !== null && <span>{formatInt(rate)} rows/s{eta !== null ? ` · about ${eta < 60 ? `${eta}s` : `${Math.ceil(eta / 60)} min`} left` : ""}</span>}
            </div>
            <BarGraph title="Live results" max={progress.total} bars={[
              { label: "Added", value: progress.added, color: COLORS.add },
              { label: "Updated", value: progress.updated, color: COLORS.update },
              { label: "Unchanged", value: progress.unchanged, color: COLORS.same },
              { label: "Rejected", value: report.invalid, color: COLORS.reject, of: report.total },
            ]} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function Steps({ phase }: { phase: Phase }) {
  const idx = phase === "pick" || phase === "uploading" ? 0 : phase === "verifying" || phase === "review" ? 1 : phase === "importing" || phase === "error" ? 2 : 3;
  const labels = ["Upload", "Verify", "Import", "Done"];
  return (
    <ol className="hidden items-center gap-1.5 text-[11px] font-semibold sm:flex" aria-label="Import steps">
      {labels.map((l, i) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-full",
            i < idx ? "bg-emerald-500 text-white" : i === idx ? "bg-[#2563eb] text-white" : "bg-admin-gray-100 text-admin-gray-400")}>
            {i < idx ? "✓" : i + 1}
          </span>
          <span className={i === idx ? "text-admin-gray-900" : "text-admin-gray-400"}>{l}</span>
          {i < labels.length - 1 && <span className="h-px w-4 bg-admin-gray-200" />}
        </li>
      ))}
    </ol>
  );
}

function BigPercent({ value, label }: { value: number; label: string }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <span className="flex items-center gap-2 text-sm font-semibold text-admin-gray-700">
        {label.endsWith("…") || label === "Importing" || label === "Uploading" ? <Loader2 className="h-4 w-4 animate-spin text-[#2563eb]" /> : null}{label}
      </span>
      <span className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] bg-clip-text text-4xl font-extrabold tabular-nums text-transparent">{value}%</span>
    </div>
  );
}

/** Gradient bar with a moving sheen while active — the "premium" progress bar. */
function ProgressBar({ pct, active, indeterminate }: { pct: number; active?: boolean; indeterminate?: boolean }) {
  return (
    <div className="relative h-3.5 overflow-hidden rounded-full bg-admin-gray-100 shadow-inner" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-r from-[#2563eb] via-[#4f46e5] to-[#7c3aed] transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      {(active || indeterminate) && (
        <div className="absolute inset-0 animate-[pm2-sheen_1.4s_linear_infinite] bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.45)_50%,transparent_75%)] bg-[length:200%_100%]" />
      )}
      <style>{"@keyframes pm2-sheen{from{background-position:200% 0}to{background-position:-200% 0}}"}</style>
    </div>
  );
}

function BarGraph({ title, bars, max }: { title: string; max: number; bars: { label: string; value: number; color: string; of?: number }[] }) {
  return (
    <div className="rounded-xl border border-admin-gray-200 p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-admin-gray-500">{title}</p>
      <div className="space-y-2.5">
        {bars.map((b) => {
          const denom = Math.max(1, b.of ?? max);
          const w = Math.min(100, (b.value / denom) * 100);
          return (
            <div key={b.label} className="grid grid-cols-[110px_minmax(0,1fr)_88px] items-center gap-3 text-sm">
              <span className="flex items-center gap-2 truncate text-admin-gray-700"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: b.color }} />{b.label}</span>
              <span className="h-3 overflow-hidden rounded-full bg-admin-gray-100">
                <span className="block h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${w}%`, background: b.color }} />
              </span>
              <span className="text-right tabular-nums"><b className="text-admin-gray-900">{formatInt(b.value)}</b> <span className="text-xs text-admin-gray-400">{Math.round(w)}%</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Review({ report }: { report: ImportAnalysis }) {
  const tiles = [
    { label: "Rows in file", value: report.total, cls: "text-admin-gray-900" },
    { label: "Verified", value: report.valid, cls: "text-emerald-600" },
    { label: "Rejected", value: report.invalid, cls: report.invalid ? "text-red-600" : "text-admin-gray-900" },
    { label: "Duplicates", value: report.duplicates, cls: report.duplicates ? "text-amber-600" : "text-admin-gray-900" },
  ];
  const segs = [
    { label: "New", value: report.willAdd, color: COLORS.add },
    { label: "Update keys", value: report.willUpdate, color: COLORS.update },
    { label: "Already here", value: report.unchanged, color: COLORS.same },
    { label: "Duplicate rows", value: report.duplicates, color: COLORS.dup },
    { label: "Rejected", value: report.invalid, color: COLORS.reject },
  ];
  const segTotal = Math.max(1, segs.reduce((s, x) => s + x.value, 0));
  const maxReason = Math.max(1, ...report.reasons.map((r) => r.count));
  const maxBrowser = Math.max(1, ...report.browsers.map((b) => b.count));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-admin-gray-200 px-4 py-3">
            <div className={cn("text-2xl font-bold tabular-nums", t.cls)}>{formatInt(t.value)}</div>
            <div className="text-xs text-admin-gray-500">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-admin-gray-200 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-admin-gray-500">What will happen</p>
        <div className="flex h-4 overflow-hidden rounded-full bg-admin-gray-100">
          {segs.filter((s) => s.value > 0).map((s) => (
            <span key={s.label} title={`${s.label}: ${formatInt(s.value)}`} className="h-full transition-[width] duration-700" style={{ width: `${(s.value / segTotal) * 100}%`, background: s.color }} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          {segs.map((s) => (
            <span key={s.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              <span className="text-admin-gray-600">{s.label}</span>
              <b className="ml-auto tabular-nums text-admin-gray-900">{formatInt(s.value)}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {report.browsers.length > 0 && (
          <div className="rounded-xl border border-admin-gray-200 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-admin-gray-500">Verified by browser</p>
            <div className="space-y-2">
              {report.browsers.map((b) => (
                <div key={b.browser} className="grid grid-cols-[110px_minmax(0,1fr)_50px] items-center gap-2 text-sm">
                  <span className="truncate text-admin-gray-700">{b.label}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-admin-gray-100"><span className="block h-full rounded-full bg-[#2563eb]" style={{ width: `${(b.count / maxBrowser) * 100}%` }} /></span>
                  <b className="text-right tabular-nums">{formatInt(b.count)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
        {report.reasons.length > 0 && (
          <div className="rounded-xl border border-red-100 bg-red-50/40 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-red-700">Why rows were rejected</p>
            <div className="space-y-2">
              {report.reasons.map((r) => (
                <div key={r.reason} className="text-sm">
                  <div className="flex justify-between gap-2"><span className="text-admin-gray-700">{r.reason}</span><b className="tabular-nums text-red-600">{formatInt(r.count)}</b></div>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-red-100"><span className="block h-full rounded-full bg-red-500" style={{ width: `${(r.count / maxReason) * 100}%` }} /></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {report.rejectedSample.length > 0 && (
        <div className="rounded-xl border border-admin-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-admin-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-admin-gray-900">Rejected rows {report.invalid > 8 && <span className="font-normal text-admin-gray-500">(first 8 of {formatInt(report.invalid)})</span>}</span>
            <a href={`/api/push2/subscribers/import/rejected?token=${encodeURIComponent(report.token)}`} className="flex items-center gap-1.5 text-sm font-medium text-[#2563eb] hover:underline">
              <Download className="h-4 w-4" /> Download all (CSV)
            </a>
          </div>
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-admin-gray-100">
              {report.rejectedSample.slice(0, 8).map((r) => (
                <tr key={r.row}>
                  <td className="w-14 px-4 py-2 tabular-nums text-admin-gray-500">#{r.row}</td>
                  <td className="px-2 py-2 font-medium text-red-600">{r.reason}</td>
                  <td className="hidden max-w-[260px] truncate px-4 py-2 font-mono text-admin-gray-400 sm:table-cell">{r.endpoint || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.valid > 0 && (
        <p className="flex items-start gap-2 text-xs text-admin-gray-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          Verification proves each row is a well-formed, genuine-looking subscription. Whether a browser still accepts pushes is only known when one is sent —
          subscribers that have left are removed automatically on the first send.
        </p>
      )}
    </div>
  );
}
