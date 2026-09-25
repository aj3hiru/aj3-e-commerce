import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { withApiErrors } from "@/lib/api-errors";

/** Verified against the action==='create' branch of customers.php. */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_customers")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
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
    const created = await prisma.ecomCustomer.create({
      data: { name, email, phone: phone || null, customerType, address: address || null, status },
    });

    await logActivity(req, session.userId, "ecom_customer_create", `Created Customer: ${name} (ID: ${created.id})`);

    return NextResponse.json({ success: true, redirect: "/admin/ecommerce/customers?success=created" });
  } catch {
    return NextResponse.json({ success: false, message: "Save failed: this email may already be in use." }, { status: 409 });
  }
}

export const POST = withApiErrors(handlePOST);
