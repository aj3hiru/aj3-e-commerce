import { NextResponse, type NextRequest } from "next/server";
import { cachedPage, isCacheable } from "@/lib/page-cache";
import { oldHostTarget, oldStaffLabel, storeHostOf } from "@/lib/hosts";

/**
 * One domain (see lib/hosts.ts): customers at "/", staff at /admin, /agent, /staff/login.
 *  - www.* and the old subdomains (login. / admin. / delivery.) send every page to the same page on the main domain;
 *  - APIs, uploads, /auth and static files answer on every host, so apps installed before the change keep working.
 */
const PASS = /^\/(uploads|files|auth)(\/|$)|\.[a-z0-9]{2,5}$/i;
const STAFF_PATHS = /^\/(admin|agent|staff|push-notifications)(\/|$)/;

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Blocks cross-site requests that change data (CSRF): another website can't
 * make a logged-in admin's browser save, delete or order anything. Our own
 * pages are fine; server-to-server calls (cron) and the staff apps send no Origin.
 */
function crossSiteBlocked(req: NextRequest, hostname: string): boolean {
  if (!UNSAFE.has(req.method)) return false;
  if (req.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return !!origin;
  let from: string;
  try { from = new URL(origin).hostname.toLowerCase(); } catch { return true; }
  if (from === hostname) return false;
  const store = storeHostOf(hostname.replace(/^www\./, ""));
  return storeHostOf(from.replace(/^www\./, "")) !== store; // the main domain, www. or an old subdomain of it
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname, search } = url;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  const hostname = host.split(":")[0];

  if (pathname.startsWith("/api/")) {
    if (crossSiteBlocked(req, hostname)) return NextResponse.json({ success: false, message: "Request blocked." }, { status: 403 });
    return NextResponse.next();
  }
  // Uploaded files: long browser cache + WebP for old photos (app/media-file).
  if (/^\/(uploads|files)\//.test(pathname)) return NextResponse.rewrite(new URL(`/media-file${pathname}${search}`, req.url));
  if (PASS.test(pathname)) return NextResponse.next();

  const port = host.includes(":") ? `:${host.split(":")[1]}` : "";
  const proto = (req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")).split(",")[0].trim();
  const to = (h: string, path: string) => NextResponse.redirect(`${proto}://${h}${port}${path}`, 308);
  // www.* → the bare domain.
  if (hostname.startsWith("www.")) return to(hostname.slice(4), pathname + search);
  // An old staff subdomain → the same page on the main domain ("admin.x.in/ecommerce/orders" → "x.in/admin/ecommerce/orders").
  const label = oldStaffLabel(hostname);
  if (label) return to(storeHostOf(hostname), oldHostTarget(label, pathname) + search);

  // The back office's front page is /admin (the dashboard).
  if (pathname === "/admin" || pathname === "/admin/") return NextResponse.rewrite(new URL(`/admin/dashboard${search}`, req.url));
  // Customers' domain.
  if (/^\/shop(\/|$)/.test(pathname)) return to(hostname, (pathname.replace(/^\/shop/, "") || "/") + search);
  if (!STAFF_PATHS.test(pathname) && isCacheable(req)) {
    const page = await cachedPage(req, hostname + port, proto).catch(() => null);
    if (page) return page;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon\\.ico).*)"],
};
