/*
 * Windows desktop app (Sri Andal Admin) — offline helper for the whole admin.
 * Registered only inside the desktop app (components/admin/DesktopBridge.tsx);
 * normal browsers never get it. The billing page keeps its own pos-sw.js.
 *
 *  - Every admin page: fresh from the server when online; the last saved copy
 *    when the internet is down. Pages in the sidebar are saved in the
 *    background while online ("warm"), with the scripts they need.
 *  - Data (GET /api/…): fresh when online, the last answer when offline.
 *  - Changes (POST / PATCH / DELETE /api/…) made offline are queued here and
 *    sent in order when the internet is back. Each carries the
 *    Idempotency-Key the page gave it, so the server applies it exactly once.
 */
const V = "v1";
const PAGES = `dsk-pages-${V}`;
const DATA = `dsk-data-${V}`;
const ASSETS = `dsk-assets-${V}`;
const NAV_TIMEOUT = 8000;
const API_TIMEOUT = 10000;

// Never queued: logging in/out, the till's own bill queue, backups/system, the staff-app API, push sign-up.
const NO_QUEUE = /^\/api\/(auth|system|cache2|app|push2\/subscribe|ecommerce\/billing|ecommerce\/backup|backup)(\/|$)/;
// Never cached: the live order feed (a long wait), and anything with a one-time answer.
const NO_CACHE = /^\/api\/(app\/v1\/events|auth|health)(\/|$)/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("dsk-") && ![PAGES, DATA, ASSETS].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* ───────── small IndexedDB store for the change queue ───────── */

function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("desktop-outbox", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("pending", { keyPath: "id" });
      r.result.createObjectStore("failed", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function store(name, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(name, mode);
    const out = fn(tx.objectStore(name));
    tx.oncomplete = () => resolve(out && "result" in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}
const all = (name) => store(name, "readonly", (s) => s.getAll());
const put = (name, v) => store(name, "readwrite", (s) => s.put(v));
const del = (name, id) => store(name, "readwrite", (s) => s.delete(id));

/** "POST /api/ecommerce/products2/12" → "Product change". */
function label(method, path) {
  const kinds = [
    [/product|stock|barcode|sizes/, "Product"], [/categor/, "Category"], [/brand/, "Brand"], [/tag|badge/, "Tag"],
    [/customer/, "Customer"], [/order|deliver/, "Order"], [/due|credit|payment-receipt/, "Due payment"],
    [/coupon|campaign|offer/, "Offer"], [/push/, "Push notification"], [/review/, "Review"], [/page/, "Page"],
    [/customizer|homepage|storefront|header|footer/, "Store design"], [/setting|business|tax/, "Settings"],
    [/user|role|profile/, "Staff"], [/media|upload|file/, "File"],
  ];
  const kind = (kinds.find(([re]) => re.test(path)) || [null, "Change"])[1];
  const verb = method === "DELETE" ? "delete" : method === "POST" && !/\/\d+(\/|$)/.test(path) ? "new" : "update";
  return `${kind} — ${verb}`;
}

/* ───────── status to every open window ───────── */

let syncing = false;
async function broadcast(extra) {
  const [pending, failed] = await Promise.all([all("pending").catch(() => []), all("failed").catch(() => [])]);
  const msg = {
    type: "queue", syncing,
    pending: pending.sort((a, b) => a.at - b.at).map((p) => ({ id: p.id, label: p.label, at: p.at })),
    failed: failed.map((f) => ({ id: f.id, label: f.label, at: f.at, message: f.message })),
    ...extra,
  };
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
}

/* ───────── sending the queue when the internet is back ───────── */

async function flush() {
  if (syncing) return;
  syncing = true;
  let sent = 0;
  try {
    const list = (await all("pending")).sort((a, b) => a.at - b.at);
    for (const item of list) {
      let res;
      try {
        res = await fetch(item.url, { method: item.method, headers: item.headers, body: item.body, credentials: "include", redirect: "manual" });
      } catch (_) {
        break; // still offline — keep the rest, in order
      }
      const text = await res.text().catch(() => "");
      let json = null;
      try { json = JSON.parse(text); } catch (_) { /* not JSON */ }
      if (res.status >= 500 || res.status === 0 || res.type === "opaqueredirect" || (res.status === 409 && json && json.retry) || res.status === 401 || res.status === 429) {
        // Server busy / restarting / signed out — try again later, keep the order.
        if (res.status === 401 || res.type === "opaqueredirect") await broadcast({ note: "signin" });
        break;
      }
      await del("pending", item.id);
      if (res.ok && !(json && json.success === false)) sent++;
      else await put("failed", { id: item.id, label: item.label, at: item.at, url: item.url, method: item.method, headers: item.headers, body: item.body, message: (json && (json.message || json.error)) || `The server said no (${res.status}).` });
    }
  } finally {
    syncing = false;
    await broadcast(sent ? { synced: sent } : undefined);
  }
}

/* ───────── saving pages in the background ───────── */

let warming = false;
async function warm(urls) {
  if (warming) return;
  warming = true;
  try {
    const pages = await caches.open(PAGES), assets = await caches.open(ASSETS);
    for (const u of urls.slice(0, 120)) {
      try {
        const res = await fetch(u, { credentials: "include", headers: { Accept: "text/html" } });
        if (!res.ok || res.redirected || res.type !== "basic") continue;
        const html = await res.clone().text();
        await pages.put(pageKey(new URL(u)), res);
        // The scripts and styles that page needs, so it also works (not just shows) offline.
        const found = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []);
        for (const a of found) {
          const url = new URL(a, self.location.origin).href;
          if (!(await assets.match(url))) { const r = await fetch(url).catch(() => null); if (r && r.ok) await assets.put(url, r); }
        }
      } catch (_) { /* offline or slow — next round */ }
    }
  } finally {
    warming = false;
  }
}

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "sync") e.waitUntil(flush());
  else if (d.type === "status") e.waitUntil(broadcast());
  else if (d.type === "warm") e.waitUntil(warm(d.urls || []));
  else if (d.type === "discard") e.waitUntil(del("failed", d.id).then(() => broadcast()));
  else if (d.type === "retry") {
    e.waitUntil((async () => {
      const f = (await all("failed")).find((x) => x.id === d.id);
      if (!f) return;
      await del("failed", f.id);
      await put("pending", { id: f.id, label: f.label, at: f.at, url: f.url, method: f.method, headers: f.headers, body: f.body });
      await flush();
    })());
  }
});

/* ───────── fetch handling ───────── */

const pageKey = (url) => url.origin + url.pathname + url.search;
const isAsset = (url) => url.pathname.startsWith("/_next/static/") || /\.(woff2?|ttf)$/.test(url.pathname);
const isMedia = (url) => url.pathname.startsWith("/uploads/") || url.pathname.startsWith("/files/");
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-Desktop-Offline": "1" } });

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (err) => { clearTimeout(t); reject(err); });
  });
}

const OFFLINE_PAGE = `<!doctype html><meta charset="utf-8"><title>Offline</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;font-family:'Segoe UI',system-ui,sans-serif;background:#f8f9fb;color:#1f2937">
<div style="text-align:center;max-width:420px;padding:24px"><div style="font-size:40px">📶</div>
<h2 style="margin:12px 0 6px;font-weight:600">No internet</h2>
<p style="color:#6b7280;font-size:14px;line-height:1.5">This page wasn't saved on this computer yet. Other pages you've opened work offline — go back, or try again when the internet is back.</p>
<p><button onclick="history.back()" style="height:32px;padding:0 16px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer">Go back</button>
<button onclick="location.reload()" style="height:32px;padding:0 16px;border:0;border-radius:4px;background:#7c3aed;color:#fff;cursor:pointer;margin-left:6px">Try again</button></p></div>`;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Changes: straight to the server; if the internet is down, queue them.
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (!url.pathname.startsWith("/api/")) return;
    e.respondWith((async () => {
      const body = await req.clone().arrayBuffer();
      try {
        return await fetch(req);
      } catch (_) {
        if (NO_QUEUE.test(url.pathname)) return json(424, { success: false, offline: true, message: "This needs an internet connection. Please try again when you're online." });
        const headers = {};
        for (const h of ["content-type", "idempotency-key", "accept"]) { const v = req.headers.get(h); if (v) headers[h] = v; }
        if (!headers["idempotency-key"]) headers["idempotency-key"] = (self.crypto.randomUUID ? self.crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
        const id = headers["idempotency-key"];
        await put("pending", { id, at: Date.now(), url: req.url, method: req.method, headers, body, label: label(req.method, url.pathname) });
        await broadcast();
        return json(202, { success: true, queued: true, offline: true, message: "Saved on this computer — it will be sent to the server when the internet is back." });
      }
    })());
    return;
  }

  // Scripts / styles / fonts: never change once built — keep forever.
  if (isAsset(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req.url, res.clone());
      return res;
    })());
    return;
  }

  // Photos: the saved copy at once, refreshed in the background.
  if (isMedia(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req.url);
      const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req.url, res.clone()); return res; }).catch(() => hit || Response.error());
      return hit || fresh;
    })());
    return;
  }

  // Data for the pages.
  if (url.pathname.startsWith("/api/")) {
    if (NO_CACHE.test(url.pathname)) return;
    e.respondWith((async () => {
      const cache = await caches.open(DATA);
      try {
        const res = await withTimeout(fetch(req), API_TIMEOUT);
        if (res.ok && res.type === "basic") cache.put(req.url, res.clone());
        return res;
      } catch (_) {
        return (await cache.match(req.url, { ignoreVary: true })) || json(424, { success: false, offline: true, message: "You're offline — this wasn't saved on this computer yet." });
      }
    })());
    return;
  }

  // Moving between pages inside the app (Next.js page data).
  if (req.headers.get("rsc") === "1") {
    const prefetch = req.headers.get("next-router-prefetch") === "1";
    e.respondWith((async () => {
      const cache = await caches.open(PAGES);
      const key = `${url.origin}${url.pathname}${url.search.replace(/[?&]_rsc=[^&]*/, "")}#rsc`;
      try {
        const res = await withTimeout(fetch(req), NAV_TIMEOUT);
        if (res.ok && !prefetch && res.type === "basic") cache.put(key, res.clone());
        return res;
      } catch (_) {
        // No saved page data: an error makes Next.js open the page normally — from the saved page below.
        return (!prefetch && (await cache.match(key, { ignoreVary: true }))) || Response.error();
      }
    })());
    return;
  }

  // Opening a page.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const cache = await caches.open(PAGES);
      const saved = () => cache.match(pageKey(url), { ignoreVary: true }).then((r) => r || cache.match(url.origin + url.pathname, { ignoreVary: true }));
      if (self.navigator && self.navigator.onLine === false) {
        const s = await saved();
        if (s) return s;
      }
      try {
        const res = await withTimeout(fetch(req), NAV_TIMEOUT);
        if (res.ok && !res.redirected && res.type === "basic") cache.put(pageKey(url), res.clone());
        return res;
      } catch (_) {
        return (await saved()) || new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
  }
});
