import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { HomepageSettingsManager } from "@/components/admin/HomepageSettingsManager";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export default async function HomepageSettingsPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_homepage")) {
    redirect("/shop/login");
  }

  const [slides, stripItemsRaw, settingsRows, sectionsRaw, categories, products] = await Promise.all([
    prisma.ecomHomeSlide.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.ecomHomeCategoryStrip.findMany({ include: { category: { select: { name: true, image: true } } }, orderBy: { sortOrder: "asc" } }),
    prisma.ecomHomeSetting.findMany({ where: { settingKey: { in: ["category_strip_mode", "category_strip_count"] } } }),
    prisma.ecomHomeSection.findMany({
      include: { items: { include: { product: { select: { name: true } } }, orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.ecomCategory.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ecomProduct.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const settingsMap: Record<string, string> = {};
  for (const s of settingsRows) settingsMap[s.settingKey] = s.settingValue;

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Homepage Settings"
      pageSubtitle="Control the slider, category strip, and content sections on your storefront homepage"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <HomepageSettingsManager
        slides={slides.map((s: (typeof slides)[number]) => ({ id: s.id, image: s.image, buttonLink: s.buttonLink, status: s.status, sortOrder: s.sortOrder }))}
        stripItems={stripItemsRaw.map((s: (typeof stripItemsRaw)[number]) => ({ id: s.id, categoryId: s.categoryId, name: s.category.name, image: s.category.image }))}
        stripMode={settingsMap.category_strip_mode ?? "pinned"}
        stripCount={Number(settingsMap.category_strip_count ?? 10)}
        sections={sectionsRaw.map((s: (typeof sectionsRaw)[number]) => ({
          id: s.id, sectionType: s.sectionType, title: s.title, sourceType: s.sourceType, cardDesign: s.cardDesign,
          productLimit: s.productLimit, bannerText: s.bannerText, bannerImage: s.bannerImage, dismissible: s.dismissible, status: s.status,
          items: s.items.map((it: (typeof s.items)[number]) => ({ id: it.id, label: it.customLabel || it.product?.name || "Item", image: it.customImage })),
        }))}
        categories={categories}
        products={products}
      />
    </AdminShell>
  );
}
