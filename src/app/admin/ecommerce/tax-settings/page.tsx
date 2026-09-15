import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { TaxSettingsManager } from "@/components/admin/TaxSettingsManager";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface TaxSettingsPageProps {
  searchParams: Promise<{ success?: string }>;
}

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "GST slab added!",
  updated: "GST slab updated!",
  deleted: "GST slab deleted!",
  default: "Default GST rate updated!",
};

export default async function TaxSettingsPage({ searchParams }: TaxSettingsPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/shop/login");
  }
  const params = await searchParams;
  const rates = await prisma.ecomGstRate.findMany({ orderBy: { rate: "asc" } });

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="GST / Tax Settings"
      pageSubtitle="Manage GST slabs used across products, billing, and checkout"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success && SUCCESS_MESSAGES[params.success] && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          {SUCCESS_MESSAGES[params.success]}
        </div>
      )}
      <TaxSettingsManager
        rates={rates.map((r: (typeof rates)[number]) => ({ id: r.id, label: r.label, rate: Number(r.rate), isDefault: r.isDefault }))}
      />
    </AdminShell>
  );
}
