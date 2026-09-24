import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPushSettings, keyFingerprint } from "@/lib/push-settings";
import { BROWSER_LABEL, browserOf, parseSubscriptionFile, verifySubscription, type CleanSubscription, type PushBrowser } from "@/lib/push-subscriptions";

/**
 * Two-step subscriber import:
 *   1. analyzeImport()   — parse + verify every row, check each against the
 *                          database, and keep the verified rows on the server
 *                          under a one-time token. Nothing is written yet.
 *   2. commitImportChunk() — write the verified rows in small chunks, so the
 *                          admin sees real progress and can stop part-way.
 * The rows written in step 2 are the server's own verified copy — nothing the
 * browser sends back is trusted.
 */

export interface RejectedRow { row: number; reason: string; endpoint: string }

export interface ImportAnalysis {
  token: string;
  fileName: string;
  format: "json" | "csv";
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  willAdd: number;
  willUpdate: number;
  unchanged: number;
  reasons: { reason: string; count: number }[];
  browsers: { browser: PushBrowser; label: string; count: number }[];
  rejectedSample: RejectedRow[];
  /** Were these subscribers created with this site's VAPID public key?
   *  "unknown" when the file doesn't say (CSV, old PHP data). */
  keyCheck: "match" | "mismatch" | "unknown" | "no-keys";
  fileKeyFingerprint: string;
  siteKeyFingerprint: string;
}

export interface ImportProgress { processed: number; total: number; added: number; updated: number; unchanged: number; done: boolean }

interface Batch {
  userId: number;
  createdAt: number;
  analysis: ImportAnalysis;
  rows: CleanSubscription[]; // verified, de-duplicated
  rejected: RejectedRow[];
  progress: ImportProgress;
  running: boolean; // one chunk at a time per batch
}

const TTL_MS = 30 * 60_000;
const MAX_BATCHES = 5;
const g = globalThis as unknown as { __pushImports?: Map<string, Batch> };
const batches: Map<string, Batch> = (g.__pushImports ??= new Map());

function prune() {
  const now = Date.now();
  for (const [k, b] of batches) if (now - b.createdAt > TTL_MS) batches.delete(k);
  while (batches.size > MAX_BATCHES) batches.delete(batches.keys().next().value!);
}

export class ImportError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function analyzeImport(text: string, fileName: string, userId: number, maxRows: number): Promise<ImportAnalysis> {
  let parsed: ReturnType<typeof parseSubscriptionFile>;
  try {
    parsed = parseSubscriptionFile(text);
  } catch {
    throw new ImportError("Couldn't read this file — it isn't valid CSV or JSON.");
  }
  if (parsed.rows.length === 0) throw new ImportError("No rows found in this file.");
  if (parsed.rows.length > maxRows) throw new ImportError(`Too many rows (max ${maxRows.toLocaleString("en-US")}).`);

  const seen = new Map<string, CleanSubscription>();
  const rejected: RejectedRow[] = [];
  const reasonCount = new Map<string, number>();
  let duplicates = 0;
  parsed.rows.forEach((raw, i) => {
    const res = verifySubscription(raw);
    if (!res.ok) {
      const ep = typeof raw === "object" && raw && typeof (raw as { endpoint?: unknown }).endpoint === "string" ? String((raw as { endpoint: string }).endpoint) : typeof raw === "string" ? raw : "";
      rejected.push({ row: i + 1, reason: res.reason, endpoint: ep.slice(0, 200) });
      reasonCount.set(res.reason, (reasonCount.get(res.reason) ?? 0) + 1);
      return;
    }
    if (seen.has(res.sub.endpoint)) duplicates++;
    seen.set(res.sub.endpoint, res.sub); // the last copy in the file wins
  });
  const rows = [...seen.values()];

  // Compare against what's already stored (by endpoint).
  let willAdd = 0, willUpdate = 0, unchanged = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const existing = (await prisma.pushSubscription.findMany({
      where: { endpoint: { in: chunk.map((c) => c.endpoint) } }, select: { endpoint: true, p256dh: true, auth: true },
    })) as { endpoint: string; p256dh: string; auth: string }[];
    const map = new Map(existing.map((e) => [e.endpoint, e]));
    for (const c of chunk) {
      const e = map.get(c.endpoint);
      if (!e) willAdd++;
      else if (e.p256dh === c.p256dh && e.auth === c.auth) unchanged++;
      else willUpdate++;
    }
  }

  const byBrowser = new Map<PushBrowser, number>();
  for (const r of rows) { const b = browserOf(r.endpoint); byBrowser.set(b, (byBrowser.get(b) ?? 0) + 1); }

  const site = await getPushSettings();
  prune();
  const token = randomBytes(18).toString("base64url");
  const analysis: ImportAnalysis = {
    token, fileName, format: parsed.format, total: parsed.rows.length,
    valid: rows.length, invalid: rejected.length, duplicates, willAdd, willUpdate, unchanged,
    reasons: [...reasonCount].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    browsers: (["chrome", "firefox", "safari", "edge", "other"] as PushBrowser[])
      .map((b) => ({ browser: b, label: BROWSER_LABEL[b], count: byBrowser.get(b) ?? 0 })).filter((b) => b.count > 0),
    rejectedSample: rejected.slice(0, 100),
    keyCheck: !site.configured ? "no-keys" : !parsed.vapidPublicKey ? "unknown" : parsed.vapidPublicKey === site.publicKey ? "match" : "mismatch",
    fileKeyFingerprint: parsed.vapidPublicKey ? keyFingerprint(parsed.vapidPublicKey) : "",
    siteKeyFingerprint: site.configured ? keyFingerprint(site.publicKey) : "",
  };
  batches.set(token, {
    userId, createdAt: Date.now(), analysis, rows, rejected, running: false,
    progress: { processed: 0, total: rows.length, added: 0, updated: 0, unchanged: 0, done: rows.length === 0 },
  });
  return analysis;
}

function getBatch(token: string, userId: number): Batch {
  prune();
  const b = batches.get(token);
  if (!b || b.userId !== userId) throw new ImportError("This import has expired — please upload the file again.", 410);
  return b;
}

/** Writes the next `size` verified rows. Upserts by endpoint; a subscriber who
 *  joined meanwhile is simply left as is. Safe to call again after an error. */
export async function commitImportChunk(token: string, userId: number, size = 250): Promise<ImportProgress> {
  const b = getBatch(token, userId);
  if (b.progress.done) return b.progress;
  if (b.running) throw new ImportError("This import is already running.", 409);
  b.running = true;
  try {
    const start = b.progress.processed;
    const chunk = b.rows.slice(start, start + Math.max(1, Math.min(size, 1000)));
    const existing = (await prisma.pushSubscription.findMany({
      where: { endpoint: { in: chunk.map((c) => c.endpoint) } }, select: { id: true, endpoint: true, p256dh: true, auth: true },
    })) as { id: number; endpoint: string; p256dh: string; auth: string }[];
    const map = new Map(existing.map((e) => [e.endpoint, e]));
    const fresh = chunk.filter((c) => !map.has(c.endpoint));
    let added = 0, updated = 0, unchanged = 0;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (fresh.length) {
        const res = await tx.pushSubscription.createMany({ data: fresh, skipDuplicates: true });
        added = res.count;
        unchanged += fresh.length - res.count;
      }
      for (const c of chunk) {
        const e = map.get(c.endpoint);
        if (!e) continue;
        if (e.p256dh === c.p256dh && e.auth === c.auth) { unchanged++; continue; }
        await tx.pushSubscription.update({ where: { id: e.id }, data: { p256dh: c.p256dh, auth: c.auth } });
        updated++;
      }
    });
    // Counted only after the chunk's transaction committed.
    b.progress.processed = start + chunk.length;
    b.progress.added += added;
    b.progress.updated += updated;
    b.progress.unchanged += unchanged;
    b.progress.done = b.progress.processed >= b.rows.length;
    return { ...b.progress };
  } finally {
    b.running = false;
  }
}

export function rejectedCsv(token: string, userId: number): { csv: string; fileName: string } {
  const b = getBatch(token, userId);
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["row,reason,endpoint", ...b.rejected.map((r) => [String(r.row), r.reason, r.endpoint].map(cell).join(","))];
  return { csv: "﻿" + lines.join("\r\n"), fileName: `rejected-${b.analysis.fileName.replace(/\.[^.]+$/, "")}.csv` };
}

export function finishImport(token: string, userId: number): ImportProgress & { fileName: string } {
  const b = getBatch(token, userId);
  return { ...b.progress, fileName: b.analysis.fileName };
}
