/**
 * One domain for everything (since Nov 2026):
 *   sriandaltraders.co.in/            customers (shop, cart, account…)
 *   sriandaltraders.co.in/staff/login staff login
 *   sriandaltraders.co.in/admin       back office
 *   sriandaltraders.co.in/agent       delivery app
 * The old subdomains (login. / admin. / delivery.) are gone: a page opened on one of them is sent to the same page
 * here (see oldHostTarget and the middleware); their /api keeps answering so apps installed before the change keep
 * working until they update. (safe to import from middleware — no Node APIs)
 */

export type StaffApp = "admin" | "delivery";

/** There are no separate staff hosts any more — every helper below then keeps paths on the one domain. */
export function staffHosts() {
  return { login: "", admin: "", delivery: "" };
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

/** The old subdomain of a host ("admin.x.in" → "admin"), or null on the main domain. */
export const oldStaffLabel = (host: string): "login" | "admin" | "delivery" | null =>
  (STAFF_LABEL.exec(host)?.[1]?.toLowerCase() as "login" | "admin" | "delivery" | undefined) ?? null;

/** Where a page of an old subdomain lives now on the main domain ("admin.x.in/ecommerce/orders" → "/admin/ecommerce/orders"). */
export function oldHostTarget(label: "login" | "admin" | "delivery", path: string): string {
  if (/^\/(admin|agent|staff|push-notifications)(\/|$)/.test(path)) return path; // already a full path
  if (label === "login") return path === "/" ? "/staff/login" : path;
  if (label === "delivery") return /^\/order\/\d+/.test(path) || !STORE_PATHS.test(path) ? toInternalPath(path, "delivery") : path;
  return STORE_PATHS.test(path) ? path : toInternalPath(path, "admin");
}

/** The customers' host for any of the store's hosts ("admin.x.in" → "x.in"). */
export const storeHostOf = (host: string) => host.replace(STAFF_LABEL, "");

/** In the browser: the customers' site origin, e.g. for "View in shop" links opened from the admin host. */
export function storeOrigin(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.protocol}//${storeHostOf(window.location.host)}`;
}

/** Customer pages — on a staff host they belong to the main domain. */
export const STORE_PATHS = /^\/(product|category|cart|checkout|login|register|account|wishlist|order)(\/|$)/;

/** The site's own origin for a redirect ("https://x.in"): behind the proxy req.url is http://localhost:3003. */
export function publicOrigin(req: { headers: Headers; nextUrl: URL }): string {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host).split(",")[0].trim();
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  const proto = (req.headers.get("x-forwarded-proto") ?? (local ? req.nextUrl.protocol.replace(":", "") : "https")).split(",")[0].trim();
  return `${proto}://${host}`;
}
