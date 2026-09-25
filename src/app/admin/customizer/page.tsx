import { redirect } from "next/navigation";
import { DisplayOptionsShell } from "@/components/admin/DisplayOptionsShell";
import { CUSTOMIZER_GROUPS, CUSTOMIZER_PREF_KEY, CUSTOMIZER_STANDALONE } from "@/components/admin/pages-display";
import { CustomizerTabs } from "@/components/admin/customizer/CustomizerTabs";
import { HomeCustomizer, type PickCategory, type PickProduct } from "@/components/admin/home-customizer/HomeCustomizer";
import { ProductPageCustomizer } from "@/components/admin/customizer/ProductPageCustomizer";
import { HeaderFooterCustomizer } from "@/components/admin/customizer/HeaderFooterCustomizer";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getDraftHome, getLiveHome } from "@/lib/home-config";
import { getDraftProductPage, getLiveProductPage } from "@/lib/product-page-config";
import { getStorefrontConfig } from "@/lib/storefront-config";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getShopHeaderSettings } from "@/lib/header-settings";
import { prisma } from "@/lib/db";

type Tab = "home" | "product" | "header" | "footer";
const TABS: { key: Tab; label: string; hint: string; perm: "manage_homepage" | "manage_payment" }[] = [
  { key: "home", label: "Homepage", hint: "Offer bar, banners, sections", perm: "manage_homepage" },
  { key: "product", label: "Product Page", hint: "Every section, order & labels", perm: "manage_homepage" },
  { key: "header", label: "Header & Menus", hint: "Header strip, menus, sidebar, push bell", perm: "manage_payment" },
  { key: "footer", label: "Footer", hint: "Columns, links, design", perm: "manage_payment" },
];

/**
 * /admin/customizer — one place to design the storefront: Homepage, Product
 * Page, Header & Menus and Footer, each beside a live preview.
 */
export default async function CustomizerPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  const allowed = TABS.filter((t) => hasPermission(session.permissions, "ecommerce", t.perm));
  if (allowed.length === 0) redirect("/admin");
  const { tab: raw } = await searchParams;
  const tab = allowed.find((t) => t.key === raw)?.key ?? allowed[0].key;

  const categories = (await prisma.ecomCategory.findMany({
    where: { status: "active" }, select: { slug: true, name: true, image: true }, orderBy: [{ serial: "asc" }, { name: "asc" }],
  })) as PickCategory[];

  let body: React.ReactNode;
  if (tab === "home") {
    const [draft, live, products] = await Promise.all([
      getDraftHome(), getLiveHome(),
      prisma.ecomProduct.findMany({ where: { status: "active" }, select: { id: true, name: true, image: true }, orderBy: { createdAt: "desc" }, take: 5000 }),
    ]);
    body = <HomeCustomizer initialDraft={draft} initialLive={live} categories={categories} products={products as PickProduct[]} />;
  } else if (tab === "product") {
    const [draft, live, products] = await Promise.all([
      getDraftProductPage(), getLiveProductPage(),
      prisma.ecomProduct.findMany({ where: { status: "active" }, select: { id: true, name: true, image: true, slug: true }, orderBy: { createdAt: "desc" }, take: 5000 }),
    ]);
    body = <ProductPageCustomizer initialDraft={draft} initialLive={live} products={products as (PickProduct & { slug: string })[]} categories={categories} />;
  } else {
    // Raw header values (no business-hours fallback baked in), so a blank time stays blank when saved.
    const [storefront, layout, header] = await Promise.all([getStorefrontConfig(), getShopLayoutData(), getShopHeaderSettings(null)]);
    body = <HeaderFooterCustomizer key={tab} part={tab} initial={storefront} initialHeader={header} categories={layout.categories} business={layout.business} />;
  }

  return (
    <DisplayOptionsShell prefKey={CUSTOMIZER_PREF_KEY} groups={CUSTOMIZER_GROUPS} standalone={CUSTOMIZER_STANDALONE}
      siteName="EduMint24"
      pageTitle="Store Customizer"
      pageSubtitle="Design your storefront with a live preview — homepage, product page, header and footer"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <CustomizerTabs tab={tab} tabs={allowed.map(({ key, label, hint }) => ({ key, label, hint }))} />
      {body}
    </DisplayOptionsShell>
  );
}
