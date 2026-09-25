import { NextResponse, type NextRequest } from "next/server";

/**
 * Staff panel on its own subdomain (e.g. login.sriandaltraders.co.in):
 *  - on the staff host, "/" is the staff login;
 *  - once STAFF_HOST is set (after the subdomain is live), staff pages on the
 *    main domain (/admin, /agent, /staff, /push-notifications) move there.
 * Customers' pages and every API keep working on both hosts.
 */
const STAFF_PATHS = /^\/(admin|agent|staff|push-notifications)(\/|$)/;

export function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const staffHost = (process.env.STAFF_HOST ?? "").toLowerCase();
  const onStaffHost = host.startsWith("login.") || (!!staffHost && host === staffHost);
  const { pathname, search } = req.nextUrl;

  if (onStaffHost) {
    if (pathname === "/") return NextResponse.rewrite(new URL(`/staff/login${search}`, req.url));
    return NextResponse.next();
  }
  if (staffHost && STAFF_PATHS.test(pathname)) {
    return NextResponse.redirect(`https://${staffHost}${pathname}${search}`, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*", "/agent/:path*", "/staff/:path*", "/push-notifications/:path*"],
};
