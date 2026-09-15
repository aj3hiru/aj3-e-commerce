import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { CustomersTable } from "@/components/admin/CustomersTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface CustomersPageProps {
  searchParams: Promise<{ success?: string }>;
}

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "Customer created successfully!",
  updated: "Customer updated successfully!",
  deleted: "Customer deleted successfully!",
};

/** Verified against admin/ecommerce/customers.php. */
export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_customers")) {
    redirect("/shop/login");
  }

  const params = await searchParams;
  const customers = await prisma.ecomCustomer.findMany({ orderBy: { createdAt: "desc" } });
  const successMessage = params.success ? SUCCESS_MESSAGES[params.success] : undefined;

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Customers"
      pageSubtitle="Manage your online and walk-in customers"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          {successMessage}
        </div>
      )}

      <CustomersTable
        customers={customers.map((c: (typeof customers)[number]) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          customerType: c.customerType,
          status: c.status,
        }))}
      />
    </AdminShell>
  );
}
