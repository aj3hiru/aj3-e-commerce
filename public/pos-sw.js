/*
 * Billing / POS offline helper. Scoped to the billing page only.
 * - The billing page: fresh from the server when online (5 s limit), the last
 *   saved copy when the internet is down — so the till always opens.
 * - Scripts, styles and product photos it uses: kept on this computer.
 * Bills themselves are queued by the page (lib/pos-offline.ts), not here.
 */
const PAGES = "pos-pages-v1";
const ASSETS = "pos-assets-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keep = [PAGES, ASSETS];
    for (const k of await caches.keys()) if (k.startsWith("pos-") && !keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isAsset = (url) => url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/uploads/"));
const pageKey = (url) => url.origin + url.pathname;

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type !== "precache") return;
  e.waitUntil((async () => {
    const cache = await caches.open(ASSETS);
    for (const u of (d.urls || []).slice(0, 400)) {
      try { if (!(await cache.match(u))) { const r = await fetch(u, { credentials: "same-origin" }); if (r.ok) await cache.put(u, r); } } catch (_) { /* offline — next time */ }
    }
  })());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate" && url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(PAGES);
      try {
        const res = await withTimeout(fetch(req), 5000);
        if (res.ok && !res.redirected && res.type === "basic") await cache.put(pageKey(url), res.clone());
        return res;
      } catch (_) {
        const saved = await cache.match(pageKey(url));
        if (saved) return saved;
        return new Response("<h2 style='font-family:sans-serif;padding:24px'>No internet. Open the billing page once while online so it can work offline.</h2>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }

  if (isAsset(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (err) {
        if (url.pathname.startsWith("/uploads/")) return new Response("", { status: 504 });
        throw err;
      }
    })());
  }
});
