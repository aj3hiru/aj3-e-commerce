import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readHandoff } from "@/lib/staff-handoff";
import { sessionVersion, setAdminSessionCookie } from "@/lib/session-cookies";
import { normalizePermissions } from "@/lib/permissions";
import { staffHosts } from "@/lib/hosts";

/** Lands a staff login on this host (see lib/staff-handoff.ts). */
export async function GET(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  const hostname = host.split(":")[0];
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  const login = staffHosts().login;
  const fail = NextResponse.redirect(login ? `${proto}://${login}/` : `${proto}://${host}/staff/login`, 303);

  const h = readHandoff(req.nextUrl.searchParams.get("t") ?? "", hostname);
  if (!h) return fail;
  const user = await prisma.user.findUnique({ where: { id: h.u } });
  if (!user || user.status !== "active" || sessionVersion(user.passwordHash) !== h.pv) return fail;
  if (!(normalizePermissions(user.permissions, user.role) as unknown as Record<string, boolean>).dashboard_access) return fail;

  await setAdminSessionCookie(user.id, user.passwordHash, h.r);
  const to = h.to.startsWith("/") && !h.to.startsWith("//") ? h.to : "/";
  const res = NextResponse.redirect(`${proto}://${host}${to}`, 303);
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
