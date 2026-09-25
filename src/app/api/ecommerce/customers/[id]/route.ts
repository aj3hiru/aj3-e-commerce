import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { hashPassword } from "@/lib/password";
import { withApiErrors } from "@/lib/api-errors";

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  // Photo: an uploads/… path, "" to remove, or leave it out to keep the current one.
  const avatar = body.avatar === "" || body.avatar === null ? null
    : typeof body.avatar === "string" && /^uploads\/[\w./-]+\.(jpe?g|png|gif|webp)$/i.test(body.avatar) && !body.avatar.includes("..") ? body.avatar : undefined;
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword && newPassword.length < 6) return NextResponse.json({ success: false, message: "The new password needs at least 6 characters." }, { status: 400 });

  if (!name) return NextResponse.json({ success: false, message: "Name is required." }, { status: 400 });
  // Mobile-OTP customers sign in with their phone, so an email is optional — but one of the two is needed.
  if (!email && !phone) return NextResponse.json({ success: false, message: "Add an email or a mobile number." }, { status: 400 });

  try {
    await prisma.ecomCustomer.update({
      where: { id: customerId },
      data: {
        name, email: email || null, phone: phone || null, customerType, address: address || null, status,
        ...(avatar !== undefined ? { avatar } : {}),
        ...(newPassword ? { password: await hashPassword(newPassword) } : {}),
      },
    });

    await logActivity(req, session.userId, "ecom_customer_update", `Updated Customer: ${name} (ID: ${customerId})${newPassword ? " — password reset" : ""}`);

    return NextResponse.json({ success: true, redirect: "/admin/ecommerce/customers?success=updated" });
  } catch {
    return NextResponse.json({ success: false, message: "Save failed: this email may already be in use." }, { status: 409 });
  }
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
