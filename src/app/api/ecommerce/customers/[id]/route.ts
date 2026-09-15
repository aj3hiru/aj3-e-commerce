import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_customers")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) {
    return NextResponse.json({ success: false, message: "Invalid customer id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  // Quick status-only toggle (matches ?set_status=active|inactive&id=N)
  if (body.status && Object.keys(body).length === 1) {
    const newStatus = body.status === "inactive" ? "inactive" : "active";
    await prisma.ecomCustomer.update({ where: { id: customerId }, data: { status: newStatus } });
    return NextResponse.json({ success: true });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const customerType = body.customerType === "offline" ? "offline" : "online";
  const address = (body.address ?? "").trim();
  const status = body.status === "inactive" ? "inactive" : "active";

  if (!name || !email) {
    return NextResponse.json({ success: false, message: "Name and email are required." }, { status: 400 });
  }

  try {
    await prisma.ecomCustomer.update({
      where: { id: customerId },
      data: { name, email, phone: phone || null, customerType, address: address || null, status },
    });

    await logActivity(req, session.userId, "ecom_customer_update", `Updated Customer: ${name} (ID: ${customerId})`);

    return NextResponse.json({ success: true, redirect: "/admin/ecommerce/customers?success=updated" });
  } catch {
    return NextResponse.json({ success: false, message: "Save failed: this email may already be in use." }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_customers")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) {
    return NextResponse.json({ success: false, message: "Invalid customer id" }, { status: 400 });
  }

  const customer = await prisma.ecomCustomer.findUnique({ where: { id: customerId }, select: { name: true } });
  await prisma.ecomCustomer.delete({ where: { id: customerId } });

  await logActivity(req, session.userId, "ecom_customer_delete", `Deleted Customer: ${customer?.name ?? "Unknown"} (ID: ${customerId})`);

  return NextResponse.json({ success: true });
}
