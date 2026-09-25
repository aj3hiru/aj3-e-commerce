import { NextRequest, NextResponse } from "next/server";
import { clearCustomerSessionCookie } from "@/lib/session-cookies";

/**
 * Verified against shop/logout.php — no activity logging for customer
 * logout, unlike the admin version.
 *
 * Same class of bugs as the admin logout route (see the comment there
 * for the full reasoning): GET removed (ShopMobileDrawer's link was
 * prefetch-triggering this silently), and a real 303 redirect used
 * instead of a JSON body nothing ever read.
 */
export async function POST(req: NextRequest) {
  await clearCustomerSessionCookie();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
