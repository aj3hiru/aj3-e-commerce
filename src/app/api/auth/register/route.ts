import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { setCustomerSessionCookie } from "@/lib/session-cookies";
import { registerSchema } from "@/lib/validators/auth";
import { getAuthSettings } from "@/lib/auth-settings";
import { otpReady } from "@/types/auth-settings";

/** Verified against shop/register.php. */
export async function POST(req: NextRequest) {
  // With mobile OTP on, new accounts are created only by verifying a mobile number.
  if (otpReady(await getAuthSettings())) {
    return NextResponse.json({ success: false, message: "Please sign up with your mobile number and OTP." }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please fill in all required fields.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
  const { name, email, phone, password } = parsed.data;

  const existing = await prisma.ecomCustomer.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ success: false, message: "An account with this email already exists. Please login instead." });
  }

  const hash = await hashPassword(password);
  const created = await prisma.ecomCustomer.create({
    data: { name, email, phone: phone || null, password: hash, customerType: "online", status: "active" },
  });

  await setCustomerSessionCookie(created.id, hash);

  return NextResponse.json({ success: true, redirect: "/account?welcome=1" });
}
