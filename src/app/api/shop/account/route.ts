import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";

export async function POST(req: NextRequest) {
  const customer = await getCustomerSession();
  if (!customer) return NextResponse.json({ success: false, message: "Please login first." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const address = (body.address ?? "").trim();

  if (!name) return NextResponse.json({ success: false, message: "Name is required." }, { status: 400 });

  await prisma.ecomCustomer.update({
    where: { id: customer.customerId },
    data: { name, phone: phone || null, address: address || null },
  });

  return NextResponse.json({ success: true, message: "Profile updated successfully!" });
}
