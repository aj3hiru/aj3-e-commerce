import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { HomeCustomizer, type PickCategory, type PickProduct } from "@/components/admin/home-customizer/HomeCustomizer";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getDraftHome, getLiveHome } from "@/lib/home-config";
import { prisma } from "@/lib/db";

/**
 * /admin/ecommerce/homepage-settings — Homepage Customizer. Edit the
 * storefront home (offer bar, info strip, sections in any order, product
 * card options, theme colour) beside a live preview of /shop. Edits autosave
 * to a draft (storefront_settings "homeDraft") that only the preview shows;
 * Publish copies it to "home", which shoppers see.
 */
export default async function HomepageCustomizerPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_homepage")) {
    redirect("/shop/login");
  }

  const [draft, live, categories, products] = await Promise.all([
    getDraftHome(),
    getLiveHome(),
    prisma.ecomCategory.findMany({ where: { status: "active" }, select: { slug: true, name: true, image: true }, orderBy: [{ serial: "asc" }, { name: "asc" }] }),
    prisma.ecomProduct.findMany({ where: { status: "active" }, select: { id: true, name: true, image: true }, orderBy: { createdAt: "desc" }, take: 5000 }),
  ]);

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Homepage Customizer"
      pageSubtitle="Design your storefront homepage with a live preview — publish when it looks right"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <HomeCustomizer initialDraft={draft} initialLive={live} categories={categories as PickCategory[]} products={products as PickProduct[]} />
    </AdminShell>
  );
}
