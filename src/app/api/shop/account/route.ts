import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";
import { getAuthSettings } from "@/lib/auth-settings";
import { otpReady } from "@/types/auth-settings";
import { withApiErrors } from "@/lib/api-errors";

/** Update the logged-in customer's profile: name (required), email (optional, unique), phone, address. */
async function handlePOST(req: NextRequest) {
  const customer = await getCustomerSession();
  if (!customer) return NextResponse.json({ success: false, message: "Please login first." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 150);
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 20) : undefined; // only changed when sent
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 1000) : undefined;

  if (!name) return NextResponse.json({ success: false, message: "Please enter your full name." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ success: false, message: "Please enter a valid email." }, { status: 400 });
  if (email) {
    const taken = await prisma.ecomCustomer.findFirst({ where: { email, id: { not: customer.customerId } }, select: { id: true } });
    if (taken) return NextResponse.json({ success: false, message: "This email is already used by another account." }, { status: 409 });
  }

  const me = await prisma.ecomCustomer.findUnique({ where: { id: customer.customerId }, select: { phone: true } });
  // With OTP login the verified mobile number is the login — it can't be edited here.
  const phoneLocked = phone === undefined || (otpReady(await getAuthSettings()) && !!me?.phone);

  await prisma.ecomCustomer.update({
    where: { id: customer.customerId },
    data: {
      name, email: email || null,
      ...(phoneLocked ? {} : { phone: phone || null }),
      ...(address !== undefined ? { address: address || null } : {}),
    },
  });

  return NextResponse.json({ success: true, message: "Profile saved!" });
}

export const POST = withApiErrors(handlePOST);
