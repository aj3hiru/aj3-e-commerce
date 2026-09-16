import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { clearAdminSessionCookie } from "@/lib/session-cookies";
import { logActivity } from "@/lib/activity-log";

/**
 * Verified against admin/api/logout.php — logs the logout event
 * (best-effort, matches the PHP try/catch around the activity log insert)
 * then clears the session.
 *
 * Two real bugs fixed here, both root-caused on the sibling StoryTimes CMS
 * project (same underlying "newbase" PHP source, same class of mistake
 * independently reintroduced here):
 *
 * 1. This used to also export a GET handler, "to support a plain
 *    <a href> link, matching the original PHP." Next.js's own <Link>
 *    component PREFETCHES its target automatically whenever it's in the
 *    viewport — and the admin logout link sits in a header dropdown
 *    that's present on every single admin page. With GET accepted, the
 *    browser was silently logging admins out in the background on
 *    ordinary page loads, with nobody clicking anything. Logout is a
 *    state-changing action and must never be GET-reachable — this is
 *    exactly what the HTTP spec reserves GET's safety guarantee for.
 *    GET is removed entirely; see AdminHeader.tsx for the matching POST
 *    <form> this now requires.
 * 2. This returned a JSON body ({ success, redirect }) rather than
 *    performing a real HTTP redirect — but nothing in this codebase
 *    ever fetched this endpoint and read that JSON. The only caller was
 *    a plain <Link>, so a real click just navigated the browser to this
 *    route's raw JSON text instead of logging out and landing anywhere.
 *    Now issues a real 303 redirect, which is also what makes a POST
 *    <form> submission land somewhere sensible.
 *
 * A THIRD "fix" I made in an earlier pass — changing the redirect target
 * from "/shop/login" to "/admin/admin-login-portal" — was itself wrong,
 * and has been reverted below. See the comment at the return statement.
 */
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
  // Correcting my OWN earlier mistake here (originally this pointed at
  // "/admin/admin-login-portal", which I mischaracterised as a bug fix).
  // I'd assumed a separate admin login — matching the sibling StoryTimes
  // CMS project's own design — without verifying against THIS project's
  // actual PHP reference. Checked it directly: admin/admin-login-portal.php
  // explicitly states "Login is now unified — admin, staff, and customer
  // accounts all sign in from the same page" and itself just redirects to
  // /shop/login.php. Every other admin page in this codebase (34 of them)
  // already redirects unauthenticated visitors to "/shop/login" for
  // exactly this reason — my earlier change was the one inconsistent with
  // the rest of the project, not the other way around. Going straight to
  // "/shop/login" avoids an unnecessary extra redirect hop through the
  // now-vestigial /admin/admin-login-portal route.
  return NextResponse.redirect(new URL("/shop/login", req.url), 303);
}
