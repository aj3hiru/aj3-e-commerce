import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { applyOrderAction, WorkflowError } from "@/lib/order-workflow";
import { withApiErrors } from "@/lib/api-errors";

/**
 * Order page actions: { action: "update_status", orderStatus, note? } ·
 * { action: "update_payment", paymentStatus, method? } · { action: "assign", agentId } ·
 * { action: "note", note }. Rules and permissions live in lib/order-workflow.ts.
 */
async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !session.permissions.orders?.view) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const orderId = Number((await params).id);
  if (!Number.isInteger(orderId)) return NextResponse.json({ success: false, message: "Invalid order id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  try {
    const message = await applyOrderAction(orderId, body, session);
    return NextResponse.json({ success: true, message });
  } catch (e) {
    if (e instanceof WorkflowError) return NextResponse.json({ success: false, message: e.message }, { status: 409 });
    console.error("order action failed", e);
    return NextResponse.json({ success: false, message: "Couldn't update the order. Please try again." }, { status: 500 });
  }
}

export const PATCH = withApiErrors(handlePATCH);
