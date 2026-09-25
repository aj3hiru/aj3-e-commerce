import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { getAttemptState, isLocked, lockSecondsLeft, recordFailedAttempt, clearAttempts } from "@/lib/login-lockout";
import { logActivity } from "@/lib/activity-log";
import { normalizePermissions } from "@/lib/permissions";
import { STAFF_ROLE_IDS } from "@/lib/roles";
import { staffPhone } from "@/lib/staff";

type StaffUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findFirst>>>;

/**
 * Checks a staff username / email / mobile + password — the same rules for the
 * website login and the staff app: 5 wrong tries lock it for 15 minutes,
 * suspended / unapproved accounts and accounts without panel access are refused.
 * Returns the user, or the error answer to send back.
 */
export async function authenticateStaff(req: NextRequest, identityRaw: unknown, passwordRaw: unknown, via: string):
  Promise<{ user: StaffUser; perms: Record<string, Record<string, boolean>> } | { error: NextResponse }> {
  const identity = String(identityRaw ?? "").trim().slice(0, 150);
  const password = String(passwordRaw ?? "");
  const fail = (message: string, status = 200) => ({ error: NextResponse.json({ success: false, message }, { status }) });
  if (!identity || !password) return fail("Enter your username / mobile / email and password.", 400);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "UNKNOWN";
  const state = await getAttemptState(identity, ip);
  if (isLocked(state)) return fail(`Too many failed attempts. Try again in ${Math.ceil(lockSecondsLeft(state) / 60)} minute(s).`, 429);

  const phone = staffPhone(identity);
  const or = [{ username: identity }, { email: identity.toLowerCase() }, { email: identity }, ...(phone && /^[\d\s+()-]+$/.test(identity) ? [{ phone }] : [])];
  const user = await prisma.user.findFirst({ where: { OR: or, role: { in: STAFF_ROLE_IDS } } });
  const ok = await verifyPassword(password, user?.passwordHash);

  if (!user || !ok) {
    const updated = await recordFailedAttempt(identity, ip);
    return fail(isLocked(updated) ? "Too many failed attempts. Try again in 15 minutes." : "Incorrect login details. Check your username / mobile / email and password.");
  }
  if (user.status === "suspended") {
    await logActivity(req, user.id, "login_blocked", `Suspended account login attempt (${via}): ${user.username}`);
    return fail("Your account has been suspended. Contact the store admin.");
  }
  if (user.status !== "active") return fail("Your account is waiting for approval by the store admin.");
  const perms = normalizePermissions(user.permissions, user.role);
  if (!(perms as unknown as Record<string, boolean>).dashboard_access) {
    await logActivity(req, user.id, "login_denied", `No dashboard_access (${via}): ${user.username}`);
    return fail("Your account doesn't have access to the staff panel yet.");
  }

  await clearAttempts(identity);
  await logActivity(req, user.id, "login_success", `Staff login ${via} (${user.role}): ${user.username}`);
  return { user, perms };
}
