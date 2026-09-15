import { NextRequest, NextResponse } from "next/server";
import { clearCustomerSessionCookie } from "@/lib/session-cookies";

/** Verified against shop/logout.php — no activity logging for customer logout,
 *  unlike the admin version. */
export async function POST(_req: NextRequest) {
  await clearCustomerSessionCookie();
  return NextResponse.json({ success: true, redirect: "/shop" });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
