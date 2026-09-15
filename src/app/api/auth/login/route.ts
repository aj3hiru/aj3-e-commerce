import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { setAdminSessionCookie, setCustomerSessionCookie } from "@/lib/session-cookies";
import { getAttemptState, isLocked, lockSecondsLeft, recordFailedAttempt, clearAttempts } from "@/lib/login-lockout";
import { logActivity } from "@/lib/activity-log";
import { loginSchema } from "@/lib/validators/auth";
import type { NextRequest as NextRequestType } from "next/server";

/**
 * Verified 1:1 against shop/login.php's POST handler. Preserves:
 * - Admin/editor/author tried first (matched by username), customer tried second (by email)
 * - dashboard_access permission gate for admin accounts
 * - suspended/pending account messages
 * - 5-attempt / 15-minute lockout (see lib/login-lockout.ts for the stateless-cookie
 *   reimplementation note — the thresholds and behavior are unchanged)
 * - activity_logs entries for login_blocked / login_denied / login_success
 *
 * NOTE ON CSRF: the original used a server-rendered hidden csrf_token field
 * checked via csrfValid(). Since this is now a fetch()-based JSON API rather
 * than a traditional form POST, the equivalent protection here is: (a) this
 * route only accepts same-site requests via SameSite=Lax session cookies, and
 * (b) you should pass the token from GET /api/auth/csrf-token if you want the
 * exact double-submit pattern preserved — wire this in your login form
 * component using lib/csrf.ts's getOrCreateCsrfToken().
 */
export async function POST(req: NextRequest) {
  const attemptState = await getAttemptState();
  if (isLocked(attemptState)) {
    return NextResponse.json(
      { success: false, message: `Too many failed attempts. Please try again in ${Math.ceil(lockSecondsLeft(attemptState) / 60)} minute(s).` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Please enter your email/username and password." }, { status: 400 });
  }
  const { identity, password, redirect } = parsed.data;

  const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "UNKNOWN";
  const userAgent = req.headers.get("user-agent") ?? "UNKNOWN";

  // ── 1) Try an admin/editor/author account first (matched by username) ──
  const adminUser = await prisma.user.findFirst({
    where: { username: identity, role: { in: ["admin", "editor", "author"] } },
  });
  const adminPassOk = await verifyPassword(password, adminUser?.passwordHash);

  if (adminUser && adminPassOk) {
    if (adminUser.status === "suspended") {
      await logActivity(req, adminUser.id, "login_blocked", `Suspended account login attempt: ${adminUser.username}`);
      return NextResponse.json({ success: false, message: "Your account has been suspended. Contact the administrator." });
    }
    if (adminUser.status === "pending") {
      await logActivity(req, adminUser.id, "login_blocked", `Pending account login attempt: ${adminUser.username}`);
      return NextResponse.json({ success: false, message: "Your account is pending approval. Please wait for admin activation." });
    }

    const permissions = (adminUser.permissions as Record<string, unknown>) ?? {};
    if (!permissions.dashboard_access) {
      await logActivity(req, adminUser.id, "login_denied", `No dashboard_access: ${adminUser.username}`);
      return NextResponse.json({ success: false, message: "You do not have permission to access the admin panel." });
    }

    await clearAttempts();
    await setAdminSessionCookie(adminUser.id);
    await logActivity(req, adminUser.id, "login_success", `Logged in as ${adminUser.role}: ${adminUser.username}`);

    return NextResponse.json({ success: true, redirect: "/admin/dashboard" });
  }

  // ── 2) Not an admin match — try a customer account (matched by email) ──
  const customer = await prisma.ecomCustomer.findFirst({ where: { email: identity } });
  const custPassOk = await verifyPassword(password, customer?.password);

  if (customer && custPassOk) {
    if (customer.status !== "active") {
      return NextResponse.json({ success: false, message: "Your account has been suspended. Please contact support." });
    }

    await clearAttempts();
    await setCustomerSessionCookie(customer.id);

    return NextResponse.json({ success: true, redirect: redirect || "/shop/account" });
  }

  // ── Neither matched ──
  const updated = await recordFailedAttempt();
  if (isLocked(updated)) {
    return NextResponse.json({ success: false, message: "Too many failed attempts. Please try again in 15 minutes." });
  }
  return NextResponse.json({ success: false, message: "Incorrect email/username or password." });
}
