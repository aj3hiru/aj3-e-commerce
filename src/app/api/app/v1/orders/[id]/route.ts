import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appSession } from "@/lib/app-api";
import { hasPermission } from "@/lib/admin-auth";
import { withApiErrors } from "@/lib/api-errors";

/** One order with its full history (who did what, when) — for the app's order screen. */
async function handleGET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  const id = Number((await params).id);
  const o = Number.isInteger(id) ? await prisma.ecomOrder.findUnique({
    where: { id },
    select: { id: true, orderNumber: true, deliveryAgentId: true, deliveryAgent: { select: { username: true, firstName: true, lastName: true, phone: true } },
      events: { orderBy: { id: "asc" }, select: { id: true, type: true, fromValue: true, toValue: true, note: true, actorName: true, createdAt: true } },
      payments: { select: { paymentMethod: true, amount: true } },
      credits: { select: { id: true, amount: true, amountPaid: true, status: true, promisedDate: true, payments: { select: { receiptNumber: true, amount: true, paymentMethod: true, createdAt: true } } } } },
  }) : null;
  const allowed = o && (hasPermission(s.permissions, "orders", "view") || hasPermission(s.permissions, "ecommerce", "manage_billing") || o.deliveryAgentId === s.userId);
  if (!o || !allowed) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
  const a = o.deliveryAgent;
  return NextResponse.json({
    success: true,
    order: {
      id: o.id, number: o.orderNumber,
      agent: a ? { id: o.deliveryAgentId, name: [a.firstName, a.lastName].filter(Boolean).join(" ") || a.username, phone: a.phone } : null,
      events: o.events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      payments: o.payments.map((p) => ({ method: p.paymentMethod, amount: Number(p.amount) })),
      credits: o.credits.map((c) => ({ id: c.id, amount: Number(c.amount), paid: Number(c.amountPaid), status: c.status, promised: c.promisedDate?.toISOString() ?? null,
        payments: c.payments.map((p) => ({ receipt: p.receiptNumber, amount: Number(p.amount), method: p.paymentMethod, at: p.createdAt.toISOString() })) })),
    },
  });
}

export const GET = withApiErrors(handleGET);
