import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { setCustomerSessionCookie } from "@/lib/session-cookies";
import { registerSchema } from "@/lib/validators/auth";
import { getAuthSettings } from "@/lib/auth-settings";
import { otpReady } from "@/types/auth-settings";
import { withApiErrors } from "@/lib/api-errors";
import { customersWithPhone, hasLogin, normalizeMobile } from "@/lib/customer-phone";

/** Verified against shop/register.php. */
async function handlePOST(req: NextRequest) {
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
  const { name, password } = parsed.data;
  const email = parsed.data.email || null;
  const phone = normalizeMobile(parsed.data.phone);
  if (!phone) return NextResponse.json({ success: false, message: "Please enter a valid 10-digit mobile number." }, { status: 400 });

  // One online account per mobile number. A customer made at the store counter with this number is not an
  // account: staff link the two after checking it's the same person (Customers → profile → Link accounts),
  // so nobody can see someone else's store bills just by typing their number.
  if ((await customersWithPhone(phone)).some(hasLogin)) {
    return NextResponse.json({ success: false, message: "This mobile number already has an account. Please login instead." }, { status: 409 });
  }
  if (email && (await prisma.ecomCustomer.findUnique({ where: { email } }))) {
    return NextResponse.json({ success: false, message: "An account with this email already exists. Please login instead." }, { status: 409 });
  }

  const hash = await hashPassword(password);
  const created = await prisma.ecomCustomer.create({
    data: { name, email, phone, password: hash, customerType: "online", status: "active" },
  });

  await setCustomerSessionCookie(created.id, hash);

  return NextResponse.json({ success: true, redirect: "/account?welcome=1" });
}

export const POST = withApiErrors(handlePOST);
