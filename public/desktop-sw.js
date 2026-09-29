/*
 * Windows desktop app (Sri Andal Admin) — makes the whole admin fast and offline.
 * Registered only inside the desktop app (components/admin/DesktopBridge.tsx);
 * normal browsers never get it. The billing page keeps its own pos-sw.js.
 *
 *  - Pages open at once from the copy saved on this computer; the latest version
 *    is fetched in the background and the page then refreshes itself (the page
 *    asks with "opened"). No copy yet: from the server, then saved.
 *  - While online, the sidebar's pages and the pages they link to (order,
 *    customer, invoice, receipt, product edit…) are saved in the background
 *    ("warm"), with the scripts they need — so they also open offline.
 *  - Data (GET /api/…): fresh when online, the last answer when offline.
 *  - Changes (POST / PATCH / DELETE /api/…) made offline are queued here and
 *    sent in order when the internet is back. Each carries the
 *    Idempotency-Key the page gave it, so the server applies it exactly once.
 */
const V = "v4";
const PAGES = `dsk-pages-${V}`;
const DATA = `dsk-data-${V}`;
const ASSETS = `dsk-assets-${V}`;
const API_TIMEOUT = 8000;
const NET_TIMEOUT = 6000; // a page not saved yet, while online
const WARM_AGE = 30 * 60_000; // saved pages older than this are fetched again in the background
const WARM_MAX = 400;

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

const pageKey = (url) => url.origin + url.pathname + url.search;
/** "Page data" (Next.js RSC) for one page, as seen from one screen (the router tree it was asked from). */
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
// (A query mark, not "#…": the Cache API ignores the part after "#", which made page data overwrite the page.)
function rscKey(url, tree, prefetch) {
  const u = new URL(url.href);
  u.searchParams.delete("_rsc");
  u.searchParams.set("__dsk_rsc", hash(tree || "") + (prefetch ? "p" : ""));
  return u.href;
}
/** A saved copy, stamped with when it was saved, without the "came through a redirect" mark (a browser refuses those for pages). */
async function stamp(res) {
  const headers = new Headers(res.headers);
  headers.set("x-dsk-at", String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
}
const age = (res) => Date.now() - Number(res?.headers.get("x-dsk-at") || 0);

// Pages reached from the sidebar's pages that are worth having offline too.
const DEEP = /^\/(ecommerce\/(orders|customers|invoice|payment-receipt)\/[^/]+|ecommerce\/products\/add\?edit=\d+|pages\/\d+|customizer\?tab=\w+|deliveries\?view=all(&tab=\w+)?)$/;

let warming = false;
async function savePage(pages, assets, u) {
  const res = await fetch(u, { credentials: "include", headers: { Accept: "text/html" } });
  // Sidebar links like /admin/ecommerce/orders land on /ecommerce/orders: keep it under both addresses.
  // Sent to the login page (signed out) = another site: not saved.
  const final = new URL(res.url || u);
  if (!res.ok || res.type !== "basic" || final.origin !== self.location.origin) return null;
  const html = await res.clone().text();
  await pages.put(pageKey(final), await stamp(res.clone()));
  if (pageKey(final) !== pageKey(new URL(u))) await pages.put(pageKey(new URL(u)), await stamp(res));
  for (const a of new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])) {
    const url = new URL(a, self.location.origin).href;
    if (!(await assets.match(url))) { const r = await fetch(url).catch(() => null); if (r && r.ok) await assets.put(url, r); }
  }
  return html;
}
async function warm(urls) {
  if (warming) return;
  warming = true;
  try {
    const pages = await caches.open(PAGES), assets = await caches.open(ASSETS);
    const queue = [...new Set(urls)], seen = new Set(queue);
    let done = 0;
    while (queue.length && done < WARM_MAX) {
      const u = queue.shift();
      done++;
      try {
        const have = await pages.match(pageKey(new URL(u)), { ignoreVary: true });
        let html = null;
        if (have && age(have) < WARM_AGE) html = await have.clone().text(); // fresh enough — only look for its links
        else html = await savePage(pages, assets, u);
        if (!html) continue;
        // One level deeper: the detail pages this page links to.
        for (const m of html.matchAll(/href="(\/[^"#]*)"/g)) {
          const href = m[1].replace(/&amp;/g, "&");
          const clean = href.replace(/^\/admin(?=\/)/, "");
          if (!DEEP.test(clean) || seen.has(self.location.origin + href)) continue;
          seen.add(self.location.origin + href);
          queue.push(self.location.origin + href);
        }
      } catch (_) { /* offline or slow — next round */ }
    }
  } finally {
    warming = false;
  }
}

/* ───────── messages from the pages ───────── */

// Pages shown from a saved copy in the last few seconds → the page asks, then refreshes from the server.
const servedStale = new Map(); // path → time
// The next page-data request for these paths goes to the server (the refresh right after a saved copy),
// if it comes within a few seconds.
const forceNet = new Map(); // path → time
function takeForce(path) {
  const at = forceNet.get(path);
  forceNet.delete(path);
  return !!at && Date.now() - at < 8000;
}
/** Which way an answer came (seen in the app's network log; "saved" = from this computer). */
function tag(res, src) {
  const headers = new Headers(res.headers);
  headers.set("x-dsk-src", src);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "sync") e.waitUntil(flush());
  else if (d.type === "status") e.waitUntil(broadcast());
  else if (d.type === "warm") e.waitUntil(warm(d.urls || []));
  else if (d.type === "opened") {
    const at = servedStale.get(d.path);
    if (at && Date.now() - at < 30_000) {
      servedStale.delete(d.path);
      forceNet.set(d.path, Date.now());
      e.source && e.source.postMessage({ type: "refresh", path: d.path });
    }
  }
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
<p style="color:#6b7280;font-size:14px;line-height:1.5">This page wasn't saved on this computer yet. Other pages work offline — go back, or try again when the internet is back.</p>
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

  // Data for the pages: fresh when online, the last answer offline.
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

  // Moving between pages inside the app (Next.js page data): the saved copy at once.
  if (req.headers.get("rsc") === "1") {
    const prefetch = req.headers.get("next-router-prefetch") === "1";
    const path = url.pathname;
    // Link prefetch (Next.js asking ahead): not needed — a click is answered from this computer at once —
    // and a click would wait for a slow prefetch still on its way. Answer "nothing" straight away.
    if (prefetch) { e.respondWith(Response.error()); return; }
    const key = rscKey(url, req.headers.get("next-router-state-tree"), false);
    e.respondWith((async () => {
      const cache = await caches.open(PAGES);
      const hit = await cache.match(key, { ignoreVary: true });
      const net = () => fetch(req).then(async (res) => {
        if (res.ok && res.type === "basic") await cache.put(key, await stamp(res.clone()));
        return res;
      });
      const forced = !prefetch && takeForce(path); // the page's refresh right after showing a saved copy → the server
      if (!forced && !prefetch) {
        if (hit) { servedStale.set(path, Date.now()); return tag(hit, "saved"); }
        // Not saved from this screen, but the page itself is: open the saved page directly (an error makes
        // Next.js do a normal page load, which the page cache answers in a few milliseconds) and save this
        // page data in the background for next time.
        const u = new URL(url.href); u.searchParams.delete("_rsc");
        const page = (await cache.match(pageKey(u), { ignoreVary: true })) || (await cache.match(u.origin + u.pathname, { ignoreVary: true }));
        if (page) { e.waitUntil(net().catch(() => {})); return Response.error(); }
      }
      try {
        return tag(await withTimeout(net(), hit ? 4000 : NET_TIMEOUT), "server");
      } catch (_) {
        // Nothing saved: an error makes Next.js open the page normally — from the saved page below.
        return hit ? tag(hit, "saved") : Response.error();
      }
    })());
    return;
  }

  // Opening a page: the saved copy at once, the latest saved again in the background.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const cache = await caches.open(PAGES);
      const hit = (await cache.match(pageKey(url), { ignoreVary: true })) || (await cache.match(url.origin + url.pathname, { ignoreVary: true }));
      const net = () => fetch(req).then(async (res) => {
        if (res.ok && !res.redirected && res.type === "basic") await cache.put(pageKey(url), await stamp(res.clone()));
        return res;
      });
      if (hit) {
        servedStale.set(url.pathname, Date.now());
        e.waitUntil(net().catch(() => {}));
        return hit;
      }
      try {
        return await withTimeout(net(), NET_TIMEOUT * 2);
      } catch (_) {
        return new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
  }
});
