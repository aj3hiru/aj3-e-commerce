import { getBusinessRow } from "@/lib/business-row";
import { AdminBrandProvider } from "@/components/admin/AdminBrand";

/** Every admin page shows the store's own name / logo (Business Settings) in the sidebar. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const biz = await getBusinessRow().catch(() => null);
  const brand = { name: biz?.businessName?.trim() || "My Store", logo: biz?.logo?.trim() || null };
  return <AdminBrandProvider brand={brand}>{children}</AdminBrandProvider>;
}
