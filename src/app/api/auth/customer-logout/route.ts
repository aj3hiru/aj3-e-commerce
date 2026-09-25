import { NextRequest, NextResponse } from "next/server";
import { clearCustomerSessionCookie } from "@/lib/session-cookies";
import { publicOrigin } from "@/lib/hosts";
import { withApiErrors } from "@/lib/api-errors";

/**
 * Verified against shop/logout.php — no activity logging for customer
 * logout, unlike the admin version.
 *
 * Same class of bugs as the admin logout route (see the comment there
 * for the full reasoning): GET removed (ShopMobileDrawer's link was
 * prefetch-triggering this silently), and a real 303 redirect used
 * instead of a JSON body nothing ever read.
 */
async function handlePOST(req: NextRequest) {
  await clearCustomerSessionCookie();
  return NextResponse.redirect(`${publicOrigin(req)}/`, 303);
}

export const POST = withApiErrors(handlePOST);
