import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { CampaignOfferManager } from "@/components/admin/CampaignOfferManager";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface CampaignOfferPageProps {
  searchParams: Promise<{ success?: string }>;
}

const SUCCESS_MESSAGES: Record<string, string> = {
  added: "Product added to campaign!",
  removed: "Product removed from campaign.",
};

export default async function CampaignOfferPage({ searchParams }: CampaignOfferPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/shop/login");
  }
  const params = await searchParams;

  const [campaignProducts, availableProducts] = await Promise.all([
    prisma.ecomProduct.findMany({ where: { isCampaign: true }, orderBy: { updatedAt: "desc" } }),
    prisma.ecomProduct.findMany({ where: { isCampaign: false }, select: { id: true, name: true, price: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Campaign Offer"
      pageSubtitle="Products currently discounted as part of a campaign"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success && SUCCESS_MESSAGES[params.success] && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          {SUCCESS_MESSAGES[params.success]}
        </div>
      )}

      <CampaignOfferManager
        campaignProducts={campaignProducts.map((p: (typeof campaignProducts)[number]) => ({
          id: p.id, name: p.name, price: Number(p.price), campaignPrice: Number(p.campaignPrice ?? 0), showOnHome: p.showOnHome,
        }))}
        availableProducts={availableProducts.map((p: (typeof availableProducts)[number]) => ({ id: p.id, name: p.name, price: Number(p.price) }))}
      />
    </AdminShell>
  );
}
