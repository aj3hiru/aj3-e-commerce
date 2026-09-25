import type { NextRequest } from "next/server";

/**
 * Guest page cache (runs in the middleware).
 *
 * Every visitor who isn't logged in and has an empty cart gets exactly the
 * same storefront page, so there is no need to build it again for each of
 * them: the finished HTML is kept for a few seconds and handed straight out.
 * When hundreds of shoppers arrive together the server builds the page once,
 * not hundreds of times. Logged-in customers, shoppers with a cart, staff and
 * customizer previews always get a freshly built page.
 */
const TTL_MS = 8_000;
const MAX_PAGES = 120;
const BYPASS = "x-page-cache-bypass";
const PERSONAL_COOKIES = ["customer_session", "shop_cart", "admin_session"];
const DROP = new Set(["set-cookie", "content-length", "content-encoding", "transfer-encoding", "connection", "keep-alive", "date"]);

type Page = { at: number; status: number; headers: [string, string][]; body: Uint8Array };
const g = globalThis as unknown as { __pageCache?: Map<string, Page>; __pageLoads?: Map<string, Promise<Page | null>> };
const pages = (g.__pageCache ??= new Map());
const loading = (g.__pageLoads ??= new Map());


/** Plain page views by guests on the customers' site only. */
export function isCacheable(req: NextRequest): boolean {
  if (req.method !== "GET" || req.headers.has(BYPASS)) return false;
  if (req.headers.has("rsc") || req.headers.has("next-router-prefetch") || req.headers.has("next-action")) return false;
  if (!(req.headers.get("accept") ?? "").includes("text/html")) return false;
  if (req.nextUrl.searchParams.has("hc")) return false;
  return !PERSONAL_COOKIES.some((c) => req.cookies.has(c));
}

async function load(req: NextRequest, host: string, proto: string): Promise<Page | null> {
  const url = `http://127.0.0.1:${process.env.PORT || "3000"}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const res = await fetch(url, {
    redirect: "manual",
    headers: { [BYPASS]: "1", "x-forwarded-host": host, "x-forwarded-proto": proto, accept: "text/html", "accept-encoding": "identity", "user-agent": req.headers.get("user-agent") ?? "" },
  });
  // Only complete, shareable pages are kept.
  if (res.status !== 200 || res.headers.has("set-cookie") || !(res.headers.get("content-type") ?? "").includes("text/html")) return null;
  const body = new Uint8Array(await res.arrayBuffer());
  const headers = [...res.headers.entries()].filter(([k]) => !DROP.has(k.toLowerCase()));
  return { at: Date.now(), status: res.status, headers, body };
}

function respond(p: Page, state: "HIT" | "MISS"): Response {
  const h = new Headers(p.headers);
  h.set("x-page-cache", state);
  return new Response(p.body as BodyInit, { status: p.status, headers: h });
}

/** The cached page, or null to let the request build it normally. */
export async function cachedPage(req: NextRequest, host: string, proto: string): Promise<Response | null> {
  const key = `${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const hit = pages.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return respond(hit, "HIT");

  // Many guests at once → one build, the rest wait for it.
  let p = loading.get(key);
  if (!p) {
    p = load(req, host, proto).catch(() => null).finally(() => loading.delete(key));
    loading.set(key, p);
  }
  const page = await p;
  if (!page) return null;
  if (pages.size >= MAX_PAGES && !pages.has(key)) pages.delete(pages.keys().next().value!);
  pages.set(key, page);
  return respond(page, "MISS");
}
