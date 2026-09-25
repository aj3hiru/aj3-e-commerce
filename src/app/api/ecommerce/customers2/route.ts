import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { parseCustomerInput } from "@/lib/customer2-save";
import { withApiErrors } from "@/lib/api-errors";

/** POST /api/ecommerce/customers2 — create a customer (Customer List 2). */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_customers")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const parsed = parseCustomerInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ success: false, message: parsed.message, field: parsed.field }, { status: 400 });
  const c = parsed.value;

  try {
    const created = await prisma.ecomCustomer.create({ data: c, select: { id: true } });
    await logActivity(req, session.userId, "ecom_customer_create", `Created Customer: ${c.name} (ID: ${created.id})`);
    return NextResponse.json({ success: true, id: created.id });
  } catch (e) {
    const dup = e instanceof Error && /Unique constraint|P2002/i.test(e.message);
    return NextResponse.json(
      { success: false, message: dup ? "Another customer already uses that email." : "Could not save the customer. Please try again.", field: dup ? "email" : undefined },
      { status: dup ? 409 : 500 }
    );
  }
}

export const POST = withApiErrors(handlePOST);
