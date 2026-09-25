/**
 * The store's domains (safe to import from middleware — no Node APIs):
 *   sriandaltraders.co.in           customers (shop, cart, account…)
 *   login.sriandaltraders.co.in     staff login          STAFF_HOST
 *   admin.sriandaltraders.co.in     back office (/admin) ADMIN_HOST
 *   delivery.sriandaltraders.co.in  delivery app (/agent) DELIVERY_HOST
 * Each staff host keeps its own login cookie; the login host hands the
 * session over with a one-time link (see /auth/handoff). With the variables
 * unset (e.g. local dev) everything stays on one host under /admin, /agent.
 */

export type StaffApp = "admin" | "delivery";

export function staffHosts() {
  const h = (v: string | undefined) => (v ?? "").trim().toLowerCase();
  return { login: h(process.env.STAFF_HOST), admin: h(process.env.ADMIN_HOST), delivery: h(process.env.DELIVERY_HOST) };
}

/** Which app an internal path belongs to. */
export function appOfPath(path: string): StaffApp | null {
  if (/^\/agent(\/|$)/.test(path)) return "delivery";
  if (/^\/(admin|push-notifications)(\/|$)/.test(path)) return "admin";
  return null;
}

/** "/admin/ecommerce/orders" → "/ecommerce/orders" on the admin host; "/agent/history" → "/history" on the delivery host. */
export function toPublicPath(path: string, app: StaffApp): string {
  if (app === "admin") {
    if (/^\/admin\/dashboard\/?$/.test(path)) return "/";
    return path.replace(/^\/admin(?=\/|$)/, "") || "/";
  }
  return path.replace(/^\/agent(?=\/|$)/, "") || "/";
}

/** The reverse, for the middleware's rewrite. */
export function toInternalPath(path: string, app: StaffApp): string {
  if (app === "admin") {
    if (path === "/") return "/admin/dashboard";
    if (/^\/push-notifications(\/|$)/.test(path)) return path;
    return `/admin${path}`;
  }
  return path === "/" ? "/agent" : `/agent${path}`;
}

/** Full URL for an internal staff path ("/admin/…", "/agent/…"), or the path itself when that host isn't set up. */
export function staffUrl(path: string, proto = "https:"): string {
  const hosts = staffHosts();
  const app = appOfPath(path);
  const host = app ? hosts[app] : "";
  return host && app ? `${proto}//${host}${toPublicPath(path, app)}` : path;
}

const STAFF_LABEL = /^(login|admin|delivery)\./i;

/** The customers' host for any of the store's hosts ("admin.x.in" → "x.in"). */
export const storeHostOf = (host: string) => host.replace(STAFF_LABEL, "");

/** In the browser: the customers' site origin, e.g. for "View in shop" links opened from the admin host. */
export function storeOrigin(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.protocol}//${storeHostOf(window.location.host)}`;
}

/** Customer pages — on a staff host they belong to the main domain. */
export const STORE_PATHS = /^\/(product|category|cart|checkout|login|register|account|wishlist|order)(\/|$)/;

/** The site's own origin for a redirect ("https://admin.x.in"): behind the proxy req.url is http://localhost:3003. */
export function publicOrigin(req: { headers: Headers; nextUrl: URL }): string {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host).split(",")[0].trim();
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  const proto = (req.headers.get("x-forwarded-proto") ?? (local ? req.nextUrl.protocol.replace(":", "") : "https")).split(",")[0].trim();
  return `${proto}://${host}`;
}
