import { createECDH } from "crypto";
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

export type VerifyResult = { ok: true; sub: CleanSubscription } | { ok: false; reason: string };

// Each push service issues endpoints of a known shape. A row that only has the
// right host but not the right path is almost certainly made up.
const PATH_RULES: { re: RegExp; path: RegExp }[] = [
  { re: /^fcm\.googleapis\.com$/, path: /^\/(fcm\/send|wp)\/[A-Za-z0-9_:\-]{20,}$/ },
  { re: /^android\.googleapis\.com$/, path: /^\/gcm\/send\/[A-Za-z0-9_:\-]{20,}$/ },
  { re: /^updates\.push\.services\.mozilla\.com$/, path: /^\/(wpush\/v[12]|push\/v1)\/[A-Za-z0-9_=\-]{20,}$/ },
  { re: /(^|\.)push\.apple\.com$/, path: /^\/[A-Za-z0-9_\-]{20,}$/ },
  { re: /(^|\.)notify\.windows\.com$/, path: /.{20,}/ },
];

function b64urlBytes(s: string): Buffer | null {
  if (!B64URL.test(s)) return null;
  try { return Buffer.from(s.replace(/=+$/, ""), "base64url"); } catch { return null; }
}

// One reusable key pair: computeSecret() throws if the other key is not a real
// point on the P-256 curve — a random 65-byte string fails this check.
let ecdh: ReturnType<typeof createECDH> | null = null;
function isP256Point(key: Buffer): boolean {
  if (key.length !== 65 || key[0] !== 0x04) return false;
  try {
    if (!ecdh) { ecdh = createECDH("prime256v1"); ecdh.generateKeys(); }
    ecdh.computeSecret(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Full check of one subscription, with the reason when it fails. Accepts the
 * browser's own `{ endpoint, keys: { p256dh, auth } }`, a flat
 * `{ endpoint, p256dh, auth }` row, or the PHP app's JSON column text.
 *   - endpoint: https, a known browser push service, and that service's path shape
 *   - p256dh:  base64url of a 65-byte uncompressed point that is really on P-256
 *   - auth:    base64url of exactly 16 bytes
 */
export function verifySubscription(input: unknown): VerifyResult {
  let v = input as Record<string, unknown> | null;
  if (typeof input === "string") {
    const t = input.trim();
    if (!t) return { ok: false, reason: "Empty row" };
    try { v = JSON.parse(t); } catch { return { ok: false, reason: "Not valid subscription JSON" }; }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, reason: "Not a subscription object" };
  const rawEndpoint = typeof v.endpoint === "string" ? v.endpoint.trim() : "";
  if (!rawEndpoint) return { ok: false, reason: "Missing endpoint" };
  if (rawEndpoint.length > 768) return { ok: false, reason: "Endpoint too long" };
  let u: URL;
  try { u = new URL(rawEndpoint); } catch { return { ok: false, reason: "Endpoint is not a URL" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "Endpoint is not https" };
  const rule = PATH_RULES.find((r) => r.re.test(u.hostname));
  if (!rule) return { ok: false, reason: "Unknown push service" };
  if (!rule.path.test(u.pathname + (u.hostname.endsWith("notify.windows.com") ? u.search : ""))) {
    return { ok: false, reason: "Endpoint doesn't look like a real subscription" };
  }

  const keys = (v.keys && typeof v.keys === "object" ? v.keys : v) as Record<string, unknown>;
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys.auth === "string" ? keys.auth.trim() : "";
  if (!p256dh) return { ok: false, reason: "Missing p256dh key" };
  const key = b64urlBytes(p256dh);
  if (!key || !isP256Point(key)) return { ok: false, reason: "p256dh is not a valid P-256 public key" };
  if (!auth) return { ok: false, reason: "Missing auth secret" };
  const secret = b64urlBytes(auth);
  if (!secret || secret.length !== 16) return { ok: false, reason: "auth secret must be 16 bytes" };

  return { ok: true, sub: { endpoint: u.toString(), p256dh, auth } };
}

/** The subscription if it passes verifySubscription(), else null. */
export function cleanSubscription(input: unknown): CleanSubscription | null {
  const r = verifySubscription(input);
  return r.ok ? r.sub : null;
}

/** Parses an uploaded CSV or JSON file into candidate subscriptions. */
export function parseSubscriptionFile(text: string): { rows: unknown[]; format: "json" | "csv"; vapidPublicKey?: string } {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : Array.isArray(data?.subscriptions) ? data.subscriptions : [data];
    // Our JSON export records which public key the subscribers belong to.
    const vapidPublicKey = !Array.isArray(data) && typeof data?.vapidPublicKey === "string" ? data.vapidPublicKey.trim() : undefined;
    return { rows: list, format: "json", vapidPublicKey };
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
