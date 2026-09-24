import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { ProductView } from "@/components/shop/product/ProductView";
import { HomeTheme } from "@/components/shop/home/HomeTheme";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCustomerSession } from "@/lib/customer-auth";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getDraftProductPage, getLiveProductPage } from "@/lib/product-page-config";
import { loadProductPage } from "@/lib/product-page-data";
import { getLiveHome } from "@/lib/home-config";
import { prisma } from "@/lib/db";

interface ProductPageProps {
  searchParams: Promise<{ slug?: string; hc?: string }>;
}

export async function generateMetadata({ searchParams }: ProductPageProps): Promise<Metadata> {
  const { slug, hc } = await searchParams;
  const p = slug ? await prisma.ecomProduct.findFirst({ where: { slug, status: "active" }, select: { name: true, description: true } }) : null;
  return {
    title: p?.name,
    description: p?.description?.slice(0, 160) || undefined,
    ...(hc ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * Product page in the style of Meesho's mobile site, built from Customizer →
 * Product Page (section order, visibility and every label). ?hc=draft shows
 * the unpublished draft — only to admins who can edit it.
 */
export default async function ProductPage({ searchParams }: ProductPageProps) {
  const { slug, hc } = await searchParams;

  let preview = false;
  if (hc === "draft") {
    const admin = await getAdminSession();
    preview = !!admin && hasPermission(admin.permissions, "ecommerce", "manage_homepage");
  }
  const [layoutData, customer, cfg, home] = await Promise.all([
    getShopLayoutData(), getCustomerSession(), preview ? getDraftProductPage() : getLiveProductPage(), getLiveHome(),
  ]);
  const data = await loadProductPage(slug ?? "", cfg);
  if (!data) notFound();

  const wishRows = customer
    ? ((await prisma.ecomWishlist.findMany({ where: { customerId: customer.customerId }, select: { productId: true } })) as { productId: number }[]).map((w) => w.productId)
    : [];

  return (
    <ShopLayout {...layoutData} promo={home.promo}>
      <HomeTheme accent={cfg.accent} card={home.card}>
        {preview && (
          <div className="sticky top-0 z-[950] -mx-8 -mt-6 mb-6 bg-[#353543] px-4 py-1.5 text-center text-xs font-semibold text-white shop:mx-0 shop:mt-0">
            Preview of unpublished changes — shoppers still see the published product page.
          </div>
        )}
        <div className="-mx-8 -mt-6 shop:mx-0 shop:mt-0">
          <ProductView d={data} cfg={cfg} wished={wishRows.includes(data.product.id)} loggedIn={!!customer} wishlisted={wishRows} />
        </div>
      </HomeTheme>
    </ShopLayout>
  );
}
