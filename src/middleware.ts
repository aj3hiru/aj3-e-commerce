import { NextResponse, type NextRequest } from "next/server";
import { STORE_PATHS, appOfPath, staffHosts, storeHostOf, toInternalPath, toPublicPath, type StaffApp } from "@/lib/hosts";

/**
 * One app, four hosts (see lib/hosts.ts):
 *  - customers' domain: clean URLs ("/shop/…" → "/…"); staff pages move to their host;
 *  - login.*    "/" is the staff login;
 *  - admin.*    "/ecommerce/orders" serves /admin/ecommerce/orders ("/" = dashboard);
 *  - delivery.* "/history" serves /agent/history ("/" = today's deliveries).
 * APIs, uploads, /auth/handoff and static files work the same on every host.
 */
const PASS = /^\/(uploads|files|auth)(\/|$)|\.[a-z0-9]{2,5}$/i;
const STAFF_PATHS = /^\/(admin|agent|staff|push-notifications)(\/|$)/;

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname, search } = url;
  if (PASS.test(pathname)) return NextResponse.next();

  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  const hostname = host.split(":")[0];
  const port = host.includes(":") ? `:${host.split(":")[1]}` : "";
  const proto = (req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")).split(",")[0].trim();
  // 308 for moved customer URLs (/shop…, www); staff moves are 307 so browsers don't cache them for good.
  const at = (h: string, path: string, status = 307) => NextResponse.redirect(`${proto}://${h}${h.includes(":") ? "" : port}${path}`, status);
  // www.* → the bare domain.
  if (hostname.startsWith("www.")) return at(hostname.slice(4), pathname + search, 308);
  const hosts = staffHosts();
  const app: StaffApp | "login" | null =
    hostname === hosts.admin ? "admin" : hostname === hosts.delivery ? "delivery" : hostname === hosts.login || hostname.startsWith("login.") ? "login" : null;
  const store = storeHostOf(hostname);

  /** A staff page opened on the wrong host → its own host (or the login host for /staff). */
  const toStaffHost = (): NextResponse | null => {
    if (/^\/staff(\/|$)/.test(pathname)) {
      if (!hosts.login || app === "login") return null;
      const next = url.searchParams.get("next");
      const nextApp = next ? appOfPath(next) : null;
      const target = next && nextApp && hosts[nextApp] ? `?next=${encodeURIComponent(`${proto}://${hosts[nextApp]}${port}${toPublicPath(next, nextApp)}`)}` : "";
      return at(hosts.login, `/${target}`);
    }
    const a = appOfPath(pathname);
    if (a && hosts[a] && app !== a) return at(hosts[a], toPublicPath(pathname, a) + search);
    return null;
  };

  if (app === "login") {
    if (pathname === "/") return NextResponse.rewrite(new URL(`/staff/login${search}`, req.url));
    if (pathname === "/staff/login") return at(hostname, `/${search}`);
    const moved = toStaffHost();
    if (moved) return moved;
    if (STAFF_PATHS.test(pathname)) return NextResponse.next();
    return at(store, pathname + search, 308);
  }

  if (app === "admin" || app === "delivery") {
    // Customizer previews (?hc=…) render the store on the admin host so the editor can reach into the frame.
    const preview = app === "admin" && url.searchParams.has("hc") && (pathname === "/" || STORE_PATHS.test(pathname));
    if (preview) return NextResponse.next();
    if (STORE_PATHS.test(pathname)) return at(store, pathname + search, 308);
    // Old /admin/… (or /agent/…) links → the clean URL.
    const own = app === "admin" ? /^\/admin(\/|$)/ : /^\/agent(\/|$)/;
    if (own.test(pathname)) return at(hostname, toPublicPath(pathname, app) + search);
    if (app === "admin" && pathname === "/dashboard") return at(hostname, `/${search}`);
    const moved = toStaffHost();
    if (moved) return moved;
    return NextResponse.rewrite(new URL(toInternalPath(pathname, app) + search, req.url));
  }

  // Customers' domain.
  if (/^\/shop(\/|$)/.test(pathname)) return at(hostname, (pathname.replace(/^\/shop/, "") || "/") + search, 308);
  if (STAFF_PATHS.test(pathname)) {
    const moved = toStaffHost();
    if (moved) return moved;
    // Only the login host is set up: every staff page lives there, as before.
    if (hosts.login) return at(hosts.login, pathname + search);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|api/|favicon\\.ico).*)"],
};
