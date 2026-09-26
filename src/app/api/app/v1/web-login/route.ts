import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionVersion, setAdminSessionCookie } from "@/lib/session-cookies";
import { consumeWebCode } from "@/lib/app-web-login";

/**
 * Opened by the staff app's web view: turns a one-time code into the normal
 * admin login cookie, marks the page as "inside the app" (the website then
 * hides its own sidebar, the app has one) and goes to `next`.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const nextRaw = url.searchParams.get("next") ?? "/";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") && !nextRaw.includes("\\") ? nextRaw : "/";
  const p = consumeWebCode(code);
  if (!p) return new NextResponse("This link has expired. Please open the page again from the app.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  const user = await prisma.user.findUnique({ where: { id: p.userId }, select: { id: true, passwordHash: true, status: true } });
  if (!user || user.status !== "active" || sessionVersion(user.passwordHash) !== p.pv) {
    return new NextResponse("Please log in to the app again.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  await setAdminSessionCookie(user.id, user.passwordHash, true);
  // Behind the proxy req.url is the internal address, so build the public origin from the headers.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const res = NextResponse.redirect(new URL(next, `${proto}://${host}`), 303);
  res.cookies.set("app_embed", "1", { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
