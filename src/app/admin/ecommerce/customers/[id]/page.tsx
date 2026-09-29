import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { CustomerProfileView } from "@/components/admin/CustomerProfileView";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { formatAddress, toAddress } from "@/lib/customer-addresses";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { linkCandidates } from "@/lib/customer-link";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { CUSTPROFILE_GROUPS, CUSTPROFILE_PREF_KEY, CUSTPROFILE_STANDALONE } from "@/components/admin/customers2/profileDisplayOptions";

interface CustomerProfilePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}

/** Verified against admin/ecommerce/customer-profile.php. */
export default async function CustomerProfilePage({ params, searchParams }: CustomerProfilePageProps) {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  if (!hasPermission(session.permissions, "ecommerce", "manage_customers")) redirect("/admin/dashboard?denied=1");

  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) notFound();

  const customer = await prisma.ecomCustomer.findUnique({ where: { id: customerId } });
  if (!customer) notFound();

  const [orders, credits, addressRows, linkable] = await Promise.all([
    prisma.ecomOrder.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, include: { payments: { orderBy: { createdAt: "asc" } } } }),
    prisma.ecomCredit.findMany({
      where: { customerId },
      include: { order: { select: { orderNumber: true } }, payments: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ecomCustomerAddress.findMany({ where: { customerId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] }),
    linkCandidates(customerId),
  ]);
  const addresses = addressRows.map(toAddress).map((a) => ({
    id: a.id, name: a.name, phone: a.phone, text: formatAddress(a), type: a.type, isDefault: a.isDefault,
    mapUrl: a.lat !== null && a.lng !== null ? `https://www.google.com/maps?q=${a.lat},${a.lng}` : null,
  }));

  const totalSpent = orders.reduce((s: number, o: (typeof orders)[number]) => s + Number(o.totalAmount), 0);

  return (
    <DashboardWidgetPrefsProvider prefKey={CUSTPROFILE_PREF_KEY} groups={CUSTPROFILE_GROUPS} standalone={CUSTPROFILE_STANDALONE}>
    <AdminShell
      siteName="EduMint24"
      pageTitle={customer.name || "New customer (no name yet)"}
      pageSubtitle="Customer profile, orders, addresses and due"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
      headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /></div>}
    >
      <div className="mb-4 flex justify-end xl:hidden"><DisplayOptionsPanel variant="toolbar" /></div>
      <CustomerProfileView
        customer={{
          id: customer.id, name: customer.name, email: customer.email, phone: customer.phone,
          address: customer.address, customerType: customer.customerType, status: customer.status,
          avatar: customer.avatar, createdAt: customer.createdAt.toISOString(),
        }}
        startEditing={(await searchParams).edit === "1"}
        orders={orders.map((o: (typeof orders)[number]) => ({
          id: o.id, orderNumber: o.orderNumber, totalAmount: Number(o.totalAmount),
          paymentStatus: o.paymentStatus, orderStatus: o.orderStatus, createdAt: o.createdAt.toISOString(),
          orderType: o.orderType,
          // Due receipts on this order (×2, ×3 when it was paid in parts) and what is still owed.
          // Everything paid on it: what was paid with the bill (opens the invoice), then each due payment receipt.
          receipts: [
            ...(o.payments.length
              ? o.payments.map((p: (typeof o.payments)[number]) => ({
                  receiptNumber: `Bill ${o.orderNumber}`, amount: Number(p.amount), paymentMethod: `${p.paymentMethod} · paid with the bill`, createdAt: p.createdAt.toISOString(), url: `/admin/ecommerce/invoice/${o.id}`,
                }))
              : [{ receiptNumber: `Bill ${o.orderNumber}`, amount: 0, paymentMethod: "Invoice · nothing paid with the bill", createdAt: o.createdAt.toISOString(), url: `/admin/ecommerce/invoice/${o.id}` }]),
            ...credits.filter((c: (typeof credits)[number]) => c.orderId === o.id).flatMap((c: (typeof credits)[number]) => c.payments.map((p: (typeof c.payments)[number]) => ({
              receiptNumber: p.receiptNumber, amount: Number(p.amount), paymentMethod: `${p.paymentMethod} · due payment`, createdAt: p.createdAt.toISOString(),
            }))),
          ],
          due: (() => {
            const c = credits.find((x: (typeof credits)[number]) => x.orderId === o.id && Number(x.amount) - Number(x.amountPaid) > 0.004);
            return c ? { creditId: c.id, balance: Math.round((Number(c.amount) - Number(c.amountPaid)) * 100) / 100 } : null;
          })(),
        }))}
        credits={credits.map((c: (typeof credits)[number]) => ({
          id: c.id, orderNumber: c.order?.orderNumber ?? null, amount: Number(c.amount), amountPaid: Number(c.amountPaid),
          status: c.status, createdAt: c.createdAt.toISOString(),
          payments: c.payments.map((p: (typeof c.payments)[number]) => ({ paymentMethod: p.paymentMethod, amount: Number(p.amount), createdAt: p.createdAt.toISOString(), receipt: p.receiptNumber })),
        }))}
        totalSpent={totalSpent}
        totalOrders={orders.length}
        addresses={addresses}
        linkable={linkable}
        login={{ hasPassword: !!customer.password, email: !!customer.email, phone: !!customer.phone && customer.customerType === "online" }}
      />
    </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
