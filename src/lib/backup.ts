import { createHash, randomUUID } from "crypto";
import { execFile } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile, cp } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clearSiteCache } from "@/lib/cache";

/**
 * Full site backup & restore (like WordPress backup plugins):
 *   backup  = every database table (one JSON-lines file each) + public/uploads
 *             + manifest.json with row counts and SHA-256 of every file, as .tar.gz
 *   restore = upload in chunks (no timeouts) → scan (manifest, checksums, only
 *             expected paths, no scripts / links) → safety backup of the current
 *             site → tables replaced one by one → uploads swapped in.
 * Work runs in the background; the page follows progress % and a live log.
 */

const run = promisify(execFile);
export const BACKUP_DIR = path.join(process.cwd(), "..", "site-backups");
const UPLOADS = path.join(process.cwd(), "public", "uploads");
const FORMAT = "sri-site-backup";
const VERSION = 1;
const SAFE_NAME = /^[A-Za-z0-9._-]+\.tar\.gz$/;
const TABLE = /^[A-Za-z0-9_]+$/;
/** Files allowed inside uploads/ in a backup (anything else — scripts, pages — is refused). */
const UPLOAD_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "ico", "pdf", "mp4", "webm", "mp3", "txt", "csv", "json", "woff", "woff2", "ttf"]);

export interface BackupFile { name: string; size: number; createdAt: string; kind: "manual" | "safety" | "uploaded" }
export interface Job {
  id: string; kind: "backup" | "validate" | "restore"; file: string | null;
  status: "running" | "done" | "failed"; percent: number; step: string;
  log: { at: string; text: string; level: "info" | "ok" | "warn" | "error" }[];
  startedAt: string; finishedAt: string | null; result?: Record<string, unknown>;
}

/* ───────────────────────── jobs ───────────────────────── */

const jobs = new Map<string, Job>();
let running: Job | null = null;

export const getJob = (id: string) => jobs.get(id) ?? null;
export const currentJob = () => running;

function newJob(kind: Job["kind"], file: string | null): Job {
  if (running && running.status === "running") throw new Error(`Please wait — a ${running.kind} is already running (${running.percent}%).`);
  const j: Job = { id: randomUUID(), kind, file, status: "running", percent: 0, step: "Starting…", log: [], startedAt: new Date().toISOString(), finishedAt: null };
  jobs.set(j.id, j);
  running = j;
  // Keep the last 20 jobs only.
  if (jobs.size > 20) jobs.delete(jobs.keys().next().value as string);
  return j;
}

function log(j: Job, text: string, level: Job["log"][number]["level"] = "info") {
  j.log.push({ at: new Date().toISOString(), text, level });
  if (j.log.length > 2000) j.log.splice(0, j.log.length - 2000);
}
const step = (j: Job, pct: number, s: string) => { j.percent = Math.max(j.percent, Math.min(100, Math.round(pct))); j.step = s; };

function finish(j: Job, ok: boolean, text: string) {
  j.status = ok ? "done" : "failed";
  if (ok) j.percent = 100;
  j.step = text;
  j.finishedAt = new Date().toISOString();
  log(j, text, ok ? "ok" : "error");
  if (running === j) running = null;
}

/* ───────────────────────── helpers ───────────────────────── */

async function sha256(file: string): Promise<string> {
  const h = createHash("sha256");
  await new Promise<void>((res, rej) => createReadStream(file).on("data", (d) => h.update(d)).on("end", () => res()).on("error", rej));
  return h.digest("hex");
}

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, base)));
    else if (e.isFile()) out.push(path.relative(base, p));
  }
  return out;
}

const safeFile = (name: string) => {
  if (!SAFE_NAME.test(name)) throw new Error("Unknown backup file.");
  return path.join(BACKUP_DIR, name);
};
export const backupPath = safeFile;

/** Database value → JSON that keeps its type (dates, big numbers, decimals, binary, JSON). */
function enc(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return { $big: v.toString() };
  if (v instanceof Date) return { $date: v.toISOString() };
  if (Prisma.Decimal.isDecimal(v)) return { $dec: (v as Prisma.Decimal).toString() };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { $b64: Buffer.from(v as Uint8Array).toString("base64") };
  if (typeof v === "object") return { $json: v };
  return v;
}
function dec(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if ("$big" in o) return BigInt(String(o.$big));
  if ("$date" in o) return new Date(String(o.$date));
  if ("$dec" in o) return String(o.$dec);
  if ("$b64" in o) return Buffer.from(String(o.$b64), "base64");
  if ("$json" in o) return JSON.stringify(o.$json);
  return JSON.stringify(v);
}

async function tables(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Record<string, string>[]>("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  return rows.map((r) => Object.values(r)[0]).filter((t) => TABLE.test(t)).sort();
}

/* ───────────────────────── list / delete ───────────────────────── */

export async function listBackups(): Promise<BackupFile[]> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const names = (await readdir(BACKUP_DIR)).filter((n) => SAFE_NAME.test(n));
  const out = await Promise.all(names.map(async (name) => {
    const s = await stat(path.join(BACKUP_DIR, name));
    return { name, size: s.size, createdAt: s.mtime.toISOString(), kind: (name.startsWith("safety-") ? "safety" : name.startsWith("uploaded-") ? "uploaded" : "manual") as BackupFile["kind"] };
  }));
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteBackup(name: string) {
  if (running?.file === name) throw new Error("This backup is in use right now.");
  await rm(safeFile(name), { force: true });
}

/* ───────────────────────── create ───────────────────────── */

export function startBackup(by: string): Job {
  const j = newJob("backup", null);
  void createBackup(j, "backup", by).then((name) => finish(j, true, `Backup ready: ${name}`)).catch((e) => finish(j, false, `Backup failed: ${e instanceof Error ? e.message : e}`));
  return j;
}

async function createBackup(j: Job, prefix: string, by: string, from = 0, to = 100): Promise<string> {
  const span = (p: number) => from + ((to - from) * p) / 100;
  const stamp = new Date(Date.now() + 330 * 60_000).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const name = `${prefix}-${stamp}.tar.gz`;
  const work = path.join(BACKUP_DIR, `.work-${j.id}`);
  await mkdir(path.join(work, "db"), { recursive: true });
  try {
    const list = await tables();
    log(j, `Saving your store data (${list.length} sections)…`);
    const counts: Record<string, number> = {};
    const sums: Record<string, string> = {};
    for (const [i, t] of list.entries()) {
      step(j, span((i / list.length) * 70), `Saving store data (${i + 1} of ${list.length})`);
      const file = path.join(work, "db", `${t}.jsonl`);
      const out = createWriteStream(file);
      let n = 0;
      // In pages, so big tables never load into memory at once.
      for (let offset = 0; ; offset += 2000) {
        const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM \`${t}\` LIMIT 2000 OFFSET ${offset}`);
        for (const r of rows) {
          const o: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(r)) o[k] = enc(v);
          if (!out.write(JSON.stringify(o) + "\n")) await new Promise<void>((res) => out.once("drain", () => res()));
        }
        n += rows.length;
        if (rows.length < 2000) break;
      }
      await new Promise<void>((res, rej) => out.end((e?: Error) => (e ? rej(e) : res())));
      counts[t] = n;
      sums[`db/${t}.jsonl`] = await sha256(file);
      log(j, `✓ ${t.replace(/^ecom_/, "").replace(/_/g, " ")} — ${n.toLocaleString("en-IN")} record${n === 1 ? "" : "s"}`);
    }

    step(j, span(72), "Checking uploaded files");
    const files = await walk(UPLOADS);
    let bytes = 0;
    for (const f of files) bytes += (await stat(path.join(UPLOADS, f))).size;
    log(j, `Images and files: ${files.length.toLocaleString("en-IN")} (${(bytes / 1048576).toFixed(1)} MB)`);

    const manifest = { format: FORMAT, version: VERSION, createdAt: new Date().toISOString(), by, site: process.env.NEXT_PUBLIC_SITE_URL ?? null, tables: counts, checksums: sums, uploads: { files: files.length, bytes } };
    await writeFile(path.join(work, "manifest.json"), JSON.stringify(manifest, null, 2));

    step(j, span(80), "Packing the backup file");
    log(j, "Putting everything into one backup file…");
    const tmp = path.join(BACKUP_DIR, `.${name}.part`);
    const args = ["-czf", tmp, "-C", work, "manifest.json", "db"];
    if (files.length) args.push("-C", path.join(process.cwd(), "public"), "uploads");
    await run("tar", args, { maxBuffer: 16 * 1024 * 1024, timeout: 30 * 60_000 });
    await rename(tmp, path.join(BACKUP_DIR, name));
    const size = (await stat(path.join(BACKUP_DIR, name))).size;
    log(j, `Saved ${name} (${(size / 1048576).toFixed(1)} MB)`, "ok");
    step(j, span(100), "Backup ready");
    return name;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/* ───────────────────────── upload (chunks) ───────────────────────── */

/** Appends one chunk of an uploaded backup; the last chunk moves it into the backups list. */
export async function receiveChunk(uploadId: string, index: number, total: number, data: Buffer, original: string): Promise<string | null> {
  if (!/^[a-f0-9-]{36}$/.test(uploadId) || index < 0 || index >= total || total > 20_000) throw new Error("Bad upload.");
  await mkdir(BACKUP_DIR, { recursive: true });
  const part = path.join(BACKUP_DIR, `.upload-${uploadId}.part`);
  if (index === 0) await rm(part, { force: true });
  else {
    const s = await stat(part).catch(() => null);
    if (!s) throw new Error("Upload interrupted — please start again.");
  }
  await writeFile(part, data, { flag: "a" });
  if (index < total - 1) return null;
  const base = original.replace(/\.tar\.gz$|\.tgz$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60) || "backup";
  const name = `uploaded-${base}-${Date.now().toString(36)}.tar.gz`;
  await rename(part, path.join(BACKUP_DIR, name));
  return name;
}

/* ───────────────────────── validate ───────────────────────── */

export function startValidate(name: string): Job {
  const j = newJob("validate", name);
  const dir = path.join(BACKUP_DIR, `.check-${j.id}`);
  void validate(j, name, dir)
    .then((m) => { j.result = m; finish(j, true, "The backup file is complete and safe to restore."); })
    .catch((e) => finish(j, false, `Not a valid backup: ${e instanceof Error ? e.message : e}`))
    .finally(() => rm(dir, { recursive: true, force: true }));
  return j;
}

type Manifest = { format: string; version: number; createdAt: string; tables: Record<string, number>; checksums: Record<string, string>; uploads?: { files: number } };

/** Scans a backup: only expected paths, no links or scripts, manifest + checksums + readable rows. Extracts into `dir`. */
async function validate(j: Job, name: string, dir: string, from = 0, to = 100): Promise<Manifest> {
  const span = (p: number) => from + ((to - from) * p) / 100;
  const file = safeFile(name);
  step(j, span(5), "Reading the file list");
  log(j, `Scanning ${name}`);
  const { stdout } = await run("tar", ["-tvzf", file], { maxBuffer: 256 * 1024 * 1024, timeout: 10 * 60_000 });
  const lines = stdout.split("\n").filter(Boolean);
  let bad = 0, uploads = 0;
  for (const l of lines) {
    const type = l[0];
    const p = l.split(/\s+/).slice(5).join(" ").replace(/^\.\//, "");
    const reason =
      type !== "-" && type !== "d" ? "link or special file" :
      p.startsWith("/") || p.split("/").includes("..") ? "path outside the backup" :
      !(p === "manifest.json" || p === "db/" || p === "db" || p.startsWith("db/") || p === "uploads" || p.startsWith("uploads")) ? "unexpected file" :
      type === "-" && p.startsWith("db/") && !/^db\/[A-Za-z0-9_]+\.jsonl$/.test(p) ? "unexpected database file" :
      type === "-" && p.startsWith("uploads/") && !UPLOAD_EXT.has((p.split(".").pop() || "").toLowerCase()) ? "file type not allowed in uploads" : null;
    if (type === "-" && p.startsWith("uploads/")) uploads++;
    if (reason) { bad++; if (bad <= 20) log(j, `  ✗ ${p} — ${reason}`, "error"); }
  }
  if (bad) throw new Error(`${bad} unsafe or unexpected file${bad === 1 ? "" : "s"} inside.`);
  log(j, `✓ File is safe — ${uploads} images and files inside`, "ok");

  step(j, span(25), "Unpacking to check it");
  await mkdir(dir, { recursive: true });
  await run("tar", ["-xzf", file, "-C", dir, "--no-same-owner", "--no-same-permissions"], { timeout: 30 * 60_000 });

  const m = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8").catch(() => { throw new Error("manifest.json is missing."); })) as Manifest;
  if (m.format !== FORMAT || m.version > VERSION) throw new Error("This file wasn't made by this site's Backup & Restore.");
  log(j, `✓ Made on ${new Date(m.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, "ok");

  const names = Object.keys(m.tables);
  for (const [i, t] of names.entries()) {
    if (!TABLE.test(t)) throw new Error(`Bad table name “${t}”.`);
    step(j, span(35 + (i / names.length) * 60), `Checking store data (${i + 1} of ${names.length})`);
    const f = path.join(dir, "db", `${t}.jsonl`);
    const sum = await sha256(f).catch(() => null);
    if (!sum) throw new Error(`Table ${t} is missing.`);
    if (m.checksums[`db/${t}.jsonl`] !== sum) throw new Error(`Table ${t} is damaged (checksum does not match).`);
    const text = await readFile(f, "utf8");
    const rows = text.split("\n").filter(Boolean);
    if (rows.length !== m.tables[t]) throw new Error(`Table ${t}: expected ${m.tables[t]} rows, found ${rows.length}.`);
    for (const r of rows) JSON.parse(r);
  }
  log(j, "✓ All store data is complete and undamaged", "ok");
  step(j, span(100), "Checked");
  return m;
}

/* ───────────────────────── restore ───────────────────────── */

export function startRestore(name: string, by: string): Job {
  const j = newJob("restore", name);
  const dir = path.join(BACKUP_DIR, `.restore-${j.id}`);
  void restore(j, name, dir, by)
    .then(() => finish(j, true, "Restore complete. Reload any open pages."))
    .catch((e) => finish(j, false, `Restore stopped: ${e instanceof Error ? e.message : e}`))
    .finally(() => rm(dir, { recursive: true, force: true }));
  return j;
}

async function restore(j: Job, name: string, dir: string, by: string) {
  const m = await validate(j, name, dir, 0, 20);

  log(j, "Saving a safety copy of the store as it is now…");
  const safety = await createBackup(j, "safety", by, 20, 45);
  log(j, `✓ Safety copy saved: ${safety} (restore it to undo)`, "ok");

  const current = new Set(await tables());
  const names = Object.keys(m.tables);
  for (const [i, t] of names.entries()) {
    step(j, 45 + (i / names.length) * 45, `Restoring store data (${i + 1} of ${names.length})`);
    if (!current.has(t)) { log(j, `– ${t.replace(/^ecom_/, "").replace(/_/g, " ")}: not used by this store any more, skipped`, "warn"); continue; }
    const rows = (await readFile(path.join(dir, "db", `${t}.jsonl`), "utf8")).split("\n").filter(Boolean).map((r) => JSON.parse(r) as Record<string, unknown>);
    const cols = new Set((await prisma.$queryRawUnsafe<{ Field: string }[]>(`SHOW COLUMNS FROM \`${t}\``)).map((c) => c.Field));
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
      await tx.$executeRawUnsafe(`DELETE FROM \`${t}\``);
      for (let k = 0; k < rows.length; k += 200) {
        const batch = rows.slice(k, k + 200);
        const keys = Object.keys(batch[0]).filter((c) => cols.has(c) && TABLE.test(c));
        if (!keys.length) continue;
        const sql = `INSERT INTO \`${t}\` (${keys.map((c) => `\`${c}\``).join(",")}) VALUES ${batch.map(() => `(${keys.map(() => "?").join(",")})`).join(",")}`;
        await tx.$executeRawUnsafe(sql, ...batch.flatMap((r) => keys.map((c) => dec(r[c]))));
      }
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
    }, { timeout: 10 * 60_000, maxWait: 60_000 });
    log(j, `✓ ${t.replace(/^ecom_/, "").replace(/_/g, " ")} — ${rows.length.toLocaleString("en-IN")} records`);
  }

  step(j, 92, "Restoring images and files");
  const incoming = path.join(dir, "uploads");
  if ((await stat(incoming).catch(() => null))?.isDirectory()) {
    const old = `${UPLOADS}.before-restore`;
    await rm(old, { recursive: true, force: true });
    if ((await stat(UPLOADS).catch(() => null))?.isDirectory()) await rename(UPLOADS, old);
    try {
      await cp(incoming, UPLOADS, { recursive: true });
    } catch (e) {
      await rm(UPLOADS, { recursive: true, force: true });
      await rename(old, UPLOADS).catch(() => {});
      throw e;
    }
    log(j, `  ✓ Uploads replaced (${(await walk(UPLOADS)).length} files). The previous folder is kept as uploads.before-restore.`, "ok");
  } else {
    log(j, "  – No uploads in this backup; files left as they are.", "warn");
  }
  clearSiteCache();
}
