import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { parseCustomerInput } from "@/lib/customer2-save";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PUT  — save the edit form.
 * PATCH { status } — the quick Active / Inactive switch in the table.
 * Deleting is deliberately not offered here: a customer is attached to orders
 * and dues, so the old page's delete is left where it is.
 */
async function guard(ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_customers")) {
    return { error: NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 }) } as const;
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: NextResponse.json({ success: false, message: "Invalid customer." }, { status: 400 }) } as const;
  }
  const customer = await prisma.ecomCustomer.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  if (!customer) return { error: NextResponse.json({ success: false, message: "This customer no longer exists." }, { status: 404 }) } as const;
  return { session, id, customer } as const;
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;

  const parsed = parseCustomerInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ success: false, message: parsed.message, field: parsed.field }, { status: 400 });

  try {
    await prisma.ecomCustomer.update({ where: { id: g.id }, data: parsed.value });
    await logActivity(req, g.session.userId, "ecom_customer_update", `Updated Customer: ${parsed.value.name} (ID: ${g.id})`);
    return NextResponse.json({ success: true });
  } catch (e) {
    const dup = e instanceof Error && /Unique constraint|P2002/i.test(e.message);
    return NextResponse.json(
      { success: false, message: dup ? "Another customer already uses that email." : "Could not save the customer. Please try again.", field: dup ? "email" : undefined },
      { status: dup ? 409 : 500 }
    );
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;

  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  if (body.status !== "active" && body.status !== "inactive") {
    return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
  }

  try {
    await prisma.ecomCustomer.update({ where: { id: g.id }, data: { status: body.status } });
    await logActivity(req, g.session.userId, "ecom_customer_update", `${body.status === "active" ? "Activated" : "Deactivated"} Customer: ${g.customer.name} (ID: ${g.id})`);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: "Could not change the status. Please try again." }, { status: 500 });
  }
}
