import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

interface SearchResult {
  type: "order" | "customer" | "receipt";
  id: number | string;
  title: string;
  sub: string;
  url: string;
}

/** Verified against admin/ecommerce/global-search.php — searches orders (by order
 *  number), customers (by name/phone/id), and payment receipts (by receipt number),
 *  5 results each, no results if not logged in or query is under 2 chars. */
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json([]);
  // Results expose customer phone numbers and order totals — only staff who
  // work with orders/customers/billing/dues may search them.
  const canSearch = ["manage_orders", "manage_customers", "manage_billing", "manage_credits"].some((k) =>
    hasPermission(session.permissions, "ecommerce", k)
  );
  if (!canSearch) return NextResponse.json([]);

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);

  const results: SearchResult[] = [];
  const numericQ = /^\d+$/.test(q) ? Number(q) : null;

  const [orders, customers, receipts] = await Promise.all([
    prisma.ecomOrder.findMany({
      where: { orderNumber: { contains: q } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, orderNumber: true, customerName: true, totalAmount: true, orderStatus: true },
    }),
    prisma.ecomCustomer.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          ...(numericQ !== null ? [{ id: numericQ }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.ecomCreditPayment.findMany({
      where: { receiptNumber: { contains: q } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { credit: { select: { customerName: true } } },
    }),
  ]);

  for (const o of orders) {
    results.push({
      type: "order",
      id: o.id,
      title: o.orderNumber,
      sub: `${o.customerName || "Walk-in"} · ₹${Number(o.totalAmount).toFixed(2)} · ${o.orderStatus}`,
      url: `/admin/ecommerce/orders/${o.id}`,
    });
  }

  for (const c of customers) {
    const dueAgg = await prisma.ecomCredit.aggregate({
      where: { customerId: c.id, status: "pending" },
      _sum: { amount: true, amountPaid: true },
    });
    const due = Math.max(0, Number(dueAgg._sum.amount ?? 0) - Number(dueAgg._sum.amountPaid ?? 0));
    const dueNote = due > 0 ? ` · Due ₹${due.toFixed(2)}` : "";
    results.push({
      type: "customer",
      id: c.id,
      title: `${c.name} (#${c.id})`,
      sub: `${c.phone || c.email || ""} · ${c.customerType.charAt(0).toUpperCase() + c.customerType.slice(1)}${dueNote}`,
      url: `/admin/ecommerce/customers/${c.id}`,
    });
  }

  for (const r of receipts) {
    results.push({
      type: "receipt",
      id: r.receiptNumber,
      title: r.receiptNumber,
      sub: `${r.credit.customerName} · ₹${Number(r.amount).toFixed(2)} · ${r.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
      url: `/admin/ecommerce/payment-receipt/${encodeURIComponent(r.receiptNumber)}?return_to=${encodeURIComponent("/admin/dashboard")}`,
    });
  }

  return NextResponse.json(results);
}
