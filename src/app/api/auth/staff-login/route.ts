import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { setAdminSessionCookie } from "@/lib/session-cookies";
import { getAttemptState, isLocked, lockSecondsLeft, recordFailedAttempt, clearAttempts } from "@/lib/login-lockout";
import { logActivity } from "@/lib/activity-log";
import { normalizePermissions } from "@/lib/permissions";
import { STAFF_ROLE_IDS } from "@/lib/roles";
import { staffHome, staffPhone } from "@/lib/staff";
import { appOfPath } from "@/lib/hosts";
import { handoffUrl, internalNext } from "@/lib/staff-handoff";
import { withApiErrors } from "@/lib/api-errors";

/**
 * Staff login (/staff/login): username, email or mobile number + password —
 * no OTP. Same lockout (5 tries / 15 min per identity and IP) as the store login.
 */
async function handlePOST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const identity = String(body.identity ?? "").trim().slice(0, 150);
  const password = String(body.password ?? "");
  if (!identity || !password) return NextResponse.json({ success: false, message: "Enter your username / mobile / email and password." }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "UNKNOWN";
  const state = await getAttemptState(identity, ip);
  if (isLocked(state)) {
    return NextResponse.json({ success: false, message: `Too many failed attempts. Try again in ${Math.ceil(lockSecondsLeft(state) / 60)} minute(s).` }, { status: 429 });
  }

  const phone = staffPhone(identity);
  const or = [{ username: identity }, { email: identity.toLowerCase() }, { email: identity }, ...(phone && /^[\d\s+()-]+$/.test(identity) ? [{ phone }] : [])];
  const user = await prisma.user.findFirst({ where: { OR: or, role: { in: STAFF_ROLE_IDS } } });
  const ok = await verifyPassword(password, user?.passwordHash);

  if (!user || !ok) {
    const updated = await recordFailedAttempt(identity, ip);
    return NextResponse.json({ success: false, message: isLocked(updated) ? "Too many failed attempts. Try again in 15 minutes." : "Incorrect login details. Check your username / mobile / email and password." });
  }
  if (user.status === "suspended") {
    await logActivity(req, user.id, "login_blocked", `Suspended account login attempt: ${user.username}`);
    return NextResponse.json({ success: false, message: "Your account has been suspended. Contact the store admin." });
  }
  if (user.status !== "active") return NextResponse.json({ success: false, message: "Your account is waiting for approval by the store admin." });
  const perms = normalizePermissions(user.permissions, user.role);
  if (!(perms as unknown as Record<string, boolean>).dashboard_access) {
    await logActivity(req, user.id, "login_denied", `No dashboard_access: ${user.username}`);
    return NextResponse.json({ success: false, message: "Your account doesn't have access to the staff panel yet." });
  }

  await clearAttempts(identity);
  await logActivity(req, user.id, "login_success", `Staff login (${user.role}): ${user.username}`);

  // The page they were heading to, if their role can use it; otherwise their own home.
  const home = staffHome(user.role, perms);
  const next = internalNext(body.next);
  const nextApp = next ? appOfPath(next) : null;
  const allowed = nextApp === "delivery" ? !!perms.delivery?.deliver : nextApp === "admin" ? home !== "/agent" : false;
  const target = next && allowed ? next : home;
  const remember = body.remember !== false;

  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  const handoff = handoffUrl(user, target, remember, proto);
  if (handoff) return NextResponse.json({ success: true, redirect: handoff });
  await setAdminSessionCookie(user.id, user.passwordHash, remember);
  return NextResponse.json({ success: true, redirect: target });
}

export const POST = withApiErrors(handlePOST);
