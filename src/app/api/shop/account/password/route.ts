import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { setCustomerSessionCookie } from "@/lib/session-cookies";

/** Set a password (OTP-only accounts) or change it (needs the current one). Keeps this device logged in. */
export async function POST(req: NextRequest) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ success: false, message: "Please login first." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const current = String(body.current ?? "");
  const next = String(body.password ?? "");
  if (next.length < 6) return NextResponse.json({ success: false, message: "Password must be at least 6 characters." }, { status: 400 });

  const me = await prisma.ecomCustomer.findUnique({ where: { id: session.customerId }, select: { password: true } });
  if (me?.password && !(await verifyPassword(current, me.password))) {
    return NextResponse.json({ success: false, message: "Your current password is incorrect." }, { status: 400 });
  }
  const hash = await hashPassword(next);
  await prisma.ecomCustomer.update({ where: { id: session.customerId }, data: { password: hash } });
  await setCustomerSessionCookie(session.customerId, hash); // other devices are signed out, this one stays in
  return NextResponse.json({ success: true, message: me?.password ? "Password changed." : "Password set — you can now log in with it too." });
}
