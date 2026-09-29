import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { LinkError, linkCustomers } from "@/lib/customer-link";
import { invalidateModel } from "@/lib/cache";
import { withApiErrors } from "@/lib/api-errors";

/** POST { with: <other customer id> } — link a store customer and an online account with the same mobile number. */
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_customers")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const id = Number((await params).id);
  const other = Number((await req.json().catch(() => ({}))).with);
  if (!Number.isInteger(id) || !Number.isInteger(other)) return NextResponse.json({ success: false, message: "Invalid customer." }, { status: 400 });
  try {
    const kept = await linkCustomers(id, other);
    invalidateModel("EcomCustomer");
    invalidateModel("EcomOrder");
    await logActivity(req, session.userId, "ecom_customer_link", `Linked store customer and online account (IDs ${id} + ${other}) → customer ID ${kept}`);
    return NextResponse.json({ success: true, id: kept, message: "Linked — the customer now sees all their store bills and online orders in one account." });
  } catch (e) {
    if (e instanceof LinkError) return NextResponse.json({ success: false, message: e.message }, { status: 400 });
    throw e;
  }
}

export const POST = withApiErrors(handlePOST);
