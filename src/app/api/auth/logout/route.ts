import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { clearAdminSessionCookie } from "@/lib/session-cookies";
import { logActivity } from "@/lib/activity-log";

/** Verified against admin/api/logout.php — logs the logout event (best-effort,
 *  matches the PHP try/catch around the activity log insert) then clears the session. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (session) {
    try {
      await logActivity(req, session.userId, "logout", `User ${session.username} logged out successfully`);
    } catch {
      // best-effort logging only, matches the PHP try/catch around this insert
    }
  }

  await clearAdminSessionCookie();
  return NextResponse.json({ success: true, redirect: "/shop/login" });
}

// Also support GET for a plain <a href="/admin/api/logout"> link, matching the
// original PHP behavior where visiting the URL directly logs you out.
export async function GET(req: NextRequest) {
  return POST(req);
}
