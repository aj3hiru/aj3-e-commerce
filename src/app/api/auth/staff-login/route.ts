import { NextRequest, NextResponse } from "next/server";
import { setAdminSessionCookie } from "@/lib/session-cookies";
import { staffHome } from "@/lib/staff";
import { authenticateStaff } from "@/lib/staff-auth";
import { appOfPath } from "@/lib/hosts";
import { handoffUrl, internalNext } from "@/lib/staff-handoff";
import { withApiErrors } from "@/lib/api-errors";

/**
 * Staff login (/staff/login): username, email or mobile number + password —
 * no OTP. Same lockout (5 tries / 15 min per identity and IP) as the store login.
 */
async function handlePOST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await authenticateStaff(req, body.identity, body.password, "web");
  if ("error" in auth) return auth.error;
  const { user, perms } = auth;

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
