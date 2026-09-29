import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";
import { customersWithPhone, hasLogin, normalizeMobile } from "@/lib/customer-phone";
import { withApiErrors } from "@/lib/api-errors";

/**
 * Update the logged-in customer's profile: name (required), email (optional, unique, can be changed), address.
 * The mobile number is the account: once set it can't be changed here (only an account made before mobile
 * numbers were required can add one, once).
 */
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
  let newPhone: string | null = null;
  if (!me?.phone && phone) {
    newPhone = normalizeMobile(phone);
    if (!newPhone) return NextResponse.json({ success: false, message: "Please enter a valid 10-digit mobile number." }, { status: 400 });
    if ((await customersWithPhone(newPhone)).some((c) => c.id !== customer.customerId && hasLogin(c))) {
      return NextResponse.json({ success: false, message: "This mobile number already has another account." }, { status: 409 });
    }
  }

  await prisma.ecomCustomer.update({
    where: { id: customer.customerId },
    data: {
      name, email: email || null,
      ...(newPhone ? { phone: newPhone } : {}),
      ...(address !== undefined ? { address: address || null } : {}),
    },
  });

  return NextResponse.json({ success: true, message: "Profile saved!" });
}

export const POST = withApiErrors(handlePOST);
