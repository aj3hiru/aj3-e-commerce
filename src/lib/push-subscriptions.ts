import { prisma } from "@/lib/db";

/**
 * Everything about stored browser push subscriptions that more than one route
 * needs: validation (public subscribe + admin import), the browser a
 * subscription belongs to, and bulk import/export.
 */

// Only real browser push services. The queue worker POSTs to whatever endpoint
// is stored, so accepting any URL would let anyone make our server call
// arbitrary hosts (SSRF) and bloat every campaign with junk rows.
const PUSH_HOSTS: { re: RegExp; browser: PushBrowser }[] = [
  { re: /^fcm\.googleapis\.com$/, browser: "chrome" }, // Chrome, Edge, Opera, Samsung, Brave
  { re: /^android\.googleapis\.com$/, browser: "chrome" },
  { re: /^updates\.push\.services\.mozilla\.com$/, browser: "firefox" },
  { re: /(^|\.)push\.apple\.com$/, browser: "safari" },
  { re: /(^|\.)notify\.windows\.com$/, browser: "edge" }, // legacy Edge
];
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export type PushBrowser = "chrome" | "firefox" | "safari" | "edge" | "other";

export const BROWSER_LABEL: Record<PushBrowser, string> = {
  chrome: "Chrome / Android", firefox: "Firefox", safari: "Safari / iOS", edge: "Edge (legacy)", other: "Other",
};

/** Endpoint host → which browser family issued the subscription. */
export function browserOf(endpoint: string): PushBrowser {
  try {
    const host = new URL(endpoint).hostname;
    return PUSH_HOSTS.find((h) => h.re.test(host))?.browser ?? "other";
  } catch {
    return "other";
  }
}

/** The endpoint, normalised, if it is an https URL on a known push service. */
export function parseEndpoint(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 768) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => h.re.test(u.hostname)) ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface CleanSubscription { endpoint: string; p256dh: string; auth: string }

/** Validates one subscription in any of the shapes we accept:
 *  the browser's own `{ endpoint, keys: { p256dh, auth } }`, a flat
 *  `{ endpoint, p256dh, auth }` row, or the PHP app's JSON column text. */
export function cleanSubscription(input: unknown): CleanSubscription | null {
  let v = input as Record<string, unknown> | null;
  if (typeof input === "string") {
    try { v = JSON.parse(input); } catch { return null; }
  }
  if (!v || typeof v !== "object") return null;
  const keys = (v.keys && typeof v.keys === "object" ? v.keys : v) as Record<string, unknown>;
  const endpoint = parseEndpoint(v.endpoint);
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys.auth === "string" ? keys.auth.trim() : "";
  if (!endpoint || !B64URL.test(p256dh) || !B64URL.test(auth) || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, p256dh, auth };
}

/** Parses an uploaded CSV or JSON file into candidate subscriptions. */
export function parseSubscriptionFile(text: string): { rows: unknown[]; format: "json" | "csv" } {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : Array.isArray(data?.subscriptions) ? data.subscriptions : [data];
    return { rows: list, format: "json" };
  }
  const lines = splitCsv(trimmed);
  if (lines.length === 0) return { rows: [], format: "csv" };
  const header = lines[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iEndpoint = col("endpoint"), iP = col("p256dh"), iA = col("auth"), iSub = col("subscription");
  const hasHeader = iEndpoint >= 0 || iSub >= 0;
  const body = hasHeader ? lines.slice(1) : lines;
  const rows = body.map((cells) => {
    if (iSub >= 0) return cells[iSub] ?? "";
    if (hasHeader) return { endpoint: cells[iEndpoint], p256dh: cells[iP], auth: cells[iA] };
    // No header: either one JSON cell per line, or endpoint,p256dh,auth.
    if (cells.length === 1) return cells[0];
    return { endpoint: cells[0], p256dh: cells[1], auth: cells[2] };
  });
  return { rows, format: "csv" };
}

/** Minimal RFC 4180 CSV splitter (quoted fields, doubled quotes, CRLF). */
function splitCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) out.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) out.push(row);
  return out;
}

export interface ImportResult { total: number; added: number; updated: number; unchanged: number; invalid: number; duplicates: number }

/** Upserts subscriptions by endpoint in chunks. Rows that fail validation are
 *  counted, never stored; repeated endpoints inside the file count once. */
export async function importSubscriptions(rows: readonly unknown[]): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, added: 0, updated: 0, unchanged: 0, invalid: 0, duplicates: 0 };
  const seen = new Map<string, CleanSubscription>();
  for (const r of rows) {
    const c = cleanSubscription(r);
    if (!c) { result.invalid++; continue; }
    if (seen.has(c.endpoint)) result.duplicates++;
    seen.set(c.endpoint, c); // last one wins
  }
  const all = [...seen.values()];
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const existing = (await prisma.pushSubscription.findMany({
      where: { endpoint: { in: chunk.map((c) => c.endpoint) } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })) as { id: number; endpoint: string; p256dh: string; auth: string }[];
    const byEndpoint = new Map(existing.map((e) => [e.endpoint, e]));
    const fresh = chunk.filter((c) => !byEndpoint.has(c.endpoint));
    if (fresh.length) {
      const res = await prisma.pushSubscription.createMany({ data: fresh, skipDuplicates: true });
      result.added += res.count;
      result.unchanged += fresh.length - res.count; // subscribed meanwhile
    }
    for (const c of chunk) {
      const e = byEndpoint.get(c.endpoint);
      if (!e) continue;
      if (e.p256dh === c.p256dh && e.auth === c.auth) { result.unchanged++; continue; }
      await prisma.pushSubscription.update({ where: { id: e.id }, data: { p256dh: c.p256dh, auth: c.auth } });
      result.updated++;
    }
  }
  return result;
}

/** How many subscribers each browser family has (for the Subscribers tab). */
export async function subscriberBreakdown(): Promise<{ browser: PushBrowser; label: string; count: number }[]> {
  const count = (contains: string) => prisma.pushSubscription.count({ where: { endpoint: { contains } } });
  const [total, fcm, androidLegacy, moz, apple, win] = await Promise.all([
    prisma.pushSubscription.count(), count("fcm.googleapis.com"), count("android.googleapis.com"),
    count("push.services.mozilla.com"), count("push.apple.com"), count("notify.windows.com"),
  ]);
  const known = fcm + androidLegacy + moz + apple + win;
  const rows: { browser: PushBrowser; count: number }[] = [
    { browser: "chrome", count: fcm + androidLegacy }, { browser: "firefox", count: moz },
    { browser: "safari", count: apple }, { browser: "edge", count: win }, { browser: "other", count: Math.max(0, total - known) },
  ];
  return rows.map((r) => ({ ...r, label: BROWSER_LABEL[r.browser] }));
}
