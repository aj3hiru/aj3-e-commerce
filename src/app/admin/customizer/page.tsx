import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, Package, PanelBottom, PanelTop } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { HomeCustomizer, type PickCategory, type PickProduct } from "@/components/admin/home-customizer/HomeCustomizer";
import { ProductPageCustomizer } from "@/components/admin/customizer/ProductPageCustomizer";
import { HeaderFooterCustomizer } from "@/components/admin/customizer/HeaderFooterCustomizer";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getDraftHome, getLiveHome } from "@/lib/home-config";
import { getDraftProductPage, getLiveProductPage } from "@/lib/product-page-config";
import { getStorefrontConfig } from "@/lib/storefront-config";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

type Tab = "home" | "product" | "header" | "footer";
const TABS: { key: Tab; label: string; hint: string; icon: typeof Home; perm: "manage_homepage" | "manage_payment" }[] = [
  { key: "home", label: "Homepage", hint: "Offer bar, banners, sections", icon: Home, perm: "manage_homepage" },
  { key: "product", label: "Product Page", hint: "Every section, order & labels", icon: Package, perm: "manage_homepage" },
  { key: "header", label: "Header & Menus", hint: "Menus, sidebar, push bell", icon: PanelTop, perm: "manage_payment" },
  { key: "footer", label: "Footer", hint: "Columns, links, design", icon: PanelBottom, perm: "manage_payment" },
];

/**
 * /admin/customizer — one place to design the storefront: Homepage, Product
 * Page, Header & Menus and Footer, each beside a live preview.
 */
export default async function CustomizerPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/shop/login");
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
    const [storefront, layout] = await Promise.all([getStorefrontConfig(), getShopLayoutData()]);
    body = <HeaderFooterCustomizer key={tab} part={tab} initial={storefront} categories={layout.categories} business={layout.business} />;
  }

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Store Customizer"
      pageSubtitle="Design your storefront with a live preview — homepage, product page, header and footer"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <nav className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Customizer sections">
        {allowed.map((t) => (
          <Link key={t.key} href={`/admin/customizer?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-xl border px-3.5 py-3 transition",
              t.key === tab ? "border-admin-primary bg-admin-primary text-white shadow-md" : "border-admin-gray-200 bg-white text-admin-gray-700 hover:border-admin-primary/50")}>
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", t.key === tab ? "bg-white/20" : "bg-admin-primary-lighter text-admin-primary")}><t.icon className="h-[18px] w-[18px]" /></span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{t.label}</span>
              <span className={cn("block truncate text-xs", t.key === tab ? "text-white/80" : "text-admin-gray-500")}>{t.hint}</span>
            </span>
          </Link>
        ))}
      </nav>
      {body}
    </AdminShell>
  );
}
