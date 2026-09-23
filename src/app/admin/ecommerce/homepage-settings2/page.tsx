import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { HomepageBuilder2, type Section2, type Slide2, type StripItem2 } from "@/components/admin/homepage-settings2/HomepageBuilder2";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

/**
 * /admin/ecommerce/homepage-settings2 — a trial redesign of Homepage
 * Settings, kept alongside /admin/ecommerce/homepage-settings so the two
 * can be compared. Same access rule (manage_homepage), same four real
 * tables (ecom_home_slides, ecom_home_category_strip, ecom_home_sections,
 * ecom_home_section_items) via a new JSON-first action dispatcher
 * (/api/ecommerce/homepage2) that mirrors the original's actions plus
 * bulk-reorder actions for drag-and-drop.
 *
 * Two deliberate simplifications from the reference design, both because
 * of what the real data model actually is:
 *
 * 1. The Hero Banner and Shop by Category blocks are FIXED at the top of
 *    the canvas, not freely draggable among the other sections. That's not
 *    a shortcut — it's how the storefront actually renders: slides have a
 *    sortOrder only among themselves, the category strip has a sortOrder
 *    only among themselves, and ecom_home_sections has its own sortOrder
 *    below both. There is no single shared order across all three, so a
 *    builder that let you drag a product grid *above* the hero banner
 *    would be showing a state the storefront can't actually produce.
 * 2. No Draft/Publish split. ecom_home_* rows are the live homepage the
 *    instant they're saved — there's no separate staging table — so every
 *    edit here saves immediately (same instant-save pattern as every other
 *    "2" page) and the header shows a real "Autosaved" timestamp instead of
 *    a Publish button that would imply a draft state that doesn't exist.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/homepage-settings2/
 *   src/components/admin/homepage-settings2/
 *   src/app/api/ecommerce/homepage2/
 *   src/lib/reorder.ts (only if nothing else starts using it)
 */
export default async function HomepageSettings2Page() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_homepage")) {
    redirect("/shop/login");
  }

  const [slidesRaw, stripRaw, settingsRows, sectionsRaw, categories, products] = await Promise.all([
    prisma.ecomHomeSlide.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.ecomHomeCategoryStrip.findMany({ include: { category: { select: { name: true, image: true } } }, orderBy: { sortOrder: "asc" } }),
    prisma.ecomHomeSetting.findMany({ where: { settingKey: { in: ["category_strip_mode", "category_strip_count"] } } }),
    prisma.ecomHomeSection.findMany({
      include: { items: { include: { product: { select: { name: true, image: true } } }, orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.ecomCategory.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ecomProduct.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const settingsMap: Record<string, string> = {};
  for (const s of settingsRows as { settingKey: string; settingValue: string }[]) settingsMap[s.settingKey] = s.settingValue;

  const slides: Slide2[] = (slidesRaw as { id: number; image: string; buttonLink: string; status: string }[])
    .map((s) => ({ id: s.id, image: s.image, buttonLink: s.buttonLink, status: s.status }));

  const stripItems: StripItem2[] = (stripRaw as { id: number; categoryId: number; category: { name: string; image: string | null } }[])
    .map((s) => ({ id: s.id, categoryId: s.categoryId, name: s.category.name, image: s.category.image }));

  const sections: Section2[] = (sectionsRaw as {
    id: number; sectionType: string; title: string | null; categoryId: number | null; sourceType: string; cardDesign: string;
    productLimit: number; bannerText: string | null; bannerImage: string | null; dismissible: boolean; status: string;
    items: { id: number; customLabel: string | null; customImage: string | null; product: { name: string; image: string | null } | null }[];
  }[]).map((s) => ({
    id: s.id, sectionType: s.sectionType, title: s.title, categoryId: s.categoryId, sourceType: s.sourceType, cardDesign: s.cardDesign,
    productLimit: s.productLimit, bannerText: s.bannerText, bannerImage: s.bannerImage, dismissible: s.dismissible, status: s.status,
    items: s.items.map((it) => ({ id: it.id, label: it.customLabel || it.product?.name || "Item", image: it.customImage || it.product?.image || null })),
  }));

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Homepage Builder"
      pageSubtitle="Visually build and customize your storefront homepage sections"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <HomepageBuilder2
        slides={slides} stripItems={stripItems} stripMode={settingsMap.category_strip_mode ?? "pinned"} stripCount={Number(settingsMap.category_strip_count ?? 10)}
        sections={sections} categories={categories} products={products}
      />
    </AdminShell>
  );
}
