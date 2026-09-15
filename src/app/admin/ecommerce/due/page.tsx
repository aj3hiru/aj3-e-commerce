import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DueTable } from "@/components/admin/DueTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface DuePageProps {
  searchParams: Promise<{ filter?: string; success?: string; error?: string; receipts?: string }>;
}

export default async function DuePage({ searchParams }: DuePageProps) {
  const session = await getAdminSession();
  if (
    !session ||
    (!hasPermission(session.permissions, "ecommerce", "manage_credits") &&
      !hasPermission(session.permissions, "ecommerce", "manage_billing"))
  ) {
    redirect("/shop/login");
  }

  const params = await searchParams;
  const filter = params.filter ?? "pending";

  const where =
    filter === "due"
      ? { status: "pending", promisedDate: { not: null, lte: new Date() } }
      : filter === "paid"
      ? { status: "paid" }
      : filter === "all"
      ? {}
      : { status: "pending" };

  const [credits, totalOutstandingAgg, totalDueTodayAgg, totalPeopleGrouped, totalNewTodayAgg] = await Promise.all([
    prisma.ecomCredit.findMany({
      where,
      include: { order: { select: { orderNumber: true } }, payments: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ promisedDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.ecomCredit.aggregate({ where: { status: "pending" }, _sum: { amount: true, amountPaid: true } }),
    prisma.ecomCredit.aggregate({
      where: { status: "pending", promisedDate: { not: null, lte: new Date() } },
      _sum: { amount: true, amountPaid: true },
    }),
    prisma.ecomCredit.groupBy({ by: ["customerName"], where: { status: "pending" } }),
    prisma.ecomCredit.aggregate({
      where: { createdAt: { gte: new Date(new Date().toDateString()) } },
      _sum: { amount: true },
    }),
  ]);

  const totalOutstanding = Number(totalOutstandingAgg._sum.amount ?? 0) - Number(totalOutstandingAgg._sum.amountPaid ?? 0);
  const totalDueToday = Number(totalDueTodayAgg._sum.amount ?? 0) - Number(totalDueTodayAgg._sum.amountPaid ?? 0);
  const totalNewToday = Number(totalNewTodayAgg._sum.amount ?? 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Due"
      pageSubtitle="Track customer dues, promised payment dates, and collections"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success === "payment" && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          Payment recorded! {params.receipts && `Receipts: ${params.receipts}`}
        </div>
      )}
      {params.success === "date" && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          Promised date updated!
        </div>
      )}
      {params.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-2.5 mb-4">{params.error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-red-600">₹{totalOutstanding.toFixed(2)}</div>
          <div className="text-xs text-admin-gray-500 mt-1">Total Due</div>
        </div>
        <div className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-amber-600">₹{totalDueToday.toFixed(2)}</div>
          <div className="text-xs text-admin-gray-500 mt-1">Due Today / Overdue</div>
        </div>
        <div className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-sky-600">{totalPeopleGrouped.length}</div>
          <div className="text-xs text-admin-gray-500 mt-1">People with Dues</div>
        </div>
        <div className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-admin-gray-900">₹{totalNewToday.toFixed(2)}</div>
          <div className="text-xs text-admin-gray-500 mt-1">Today Due</div>
        </div>
      </div>

      <DueTable
        currentFilter={filter}
        credits={credits.map((c: (typeof credits)[number]) => ({
          id: c.id,
          customerName: c.customerName,
          customerPhone: c.customerPhone,
          orderId: c.orderId,
          orderNumber: c.order?.orderNumber ?? null,
          amount: Number(c.amount),
          amountPaid: Number(c.amountPaid),
          promisedDate: c.promisedDate ? c.promisedDate.toISOString().slice(0, 10) : null,
          status: c.status,
          isOverdue: c.status === "pending" && !!c.promisedDate && c.promisedDate <= today,
          history: c.payments.map((p: (typeof c.payments)[number]) => ({
            receiptNumber: p.receiptNumber,
            amount: Number(p.amount),
            paymentMethod: p.paymentMethod,
            createdAt: p.createdAt.toISOString(),
          })),
        }))}
      />
    </AdminShell>
  );
}
