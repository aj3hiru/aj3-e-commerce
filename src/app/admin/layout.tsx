import { prisma } from "@/lib/db";
import { AdminBrandProvider } from "@/components/admin/AdminBrand";

/** Every admin page shows the store's own name / logo (Business Settings) in the sidebar. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const biz = await prisma.ecomBusinessSettings
    .findFirst({ orderBy: { id: "asc" }, select: { businessName: true, logo: true } })
    .catch(() => null);
  const brand = { name: biz?.businessName?.trim() || "My Store", logo: biz?.logo?.trim() || null };
  return <AdminBrandProvider brand={brand}>{children}</AdminBrandProvider>;
}
