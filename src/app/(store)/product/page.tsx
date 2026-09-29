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
import { imageUrl, storeSiteOrigin } from "@/lib/seo";

interface ProductPageProps {
  searchParams: Promise<{ slug?: string; hc?: string }>;
}

export async function generateMetadata({ searchParams }: ProductPageProps): Promise<Metadata> {
  const { slug, hc } = await searchParams;
  const p = slug ? await prisma.ecomProduct.findFirst({ where: { slug, status: "active" }, select: { name: true, description: true, image: true, slug: true } }) : null;
  if (!p) return { title: "Product not found", robots: { index: false } };
  const origin = await storeSiteOrigin();
  const description = p.description?.replace(/\s+/g, " ").trim().slice(0, 160) || undefined;
  const image = imageUrl(origin, p.image);
  const url = `/product?slug=${encodeURIComponent(p.slug)}`;
  return {
    title: p.name,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", title: p.name, description, url, ...(image ? { images: [{ url: image }] } : {}) },
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

  // Search engines: name, photo, price, stock and rating of the product (schema.org Product).
  const origin = await storeSiteOrigin();
  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: data.product.name,
    image: data.product.images.map((i) => imageUrl(origin, i)).filter(Boolean).slice(0, 5),
    ...(data.product.description ? { description: data.product.description.slice(0, 5000) } : {}),
    ...(data.product.sku ? { sku: data.product.sku } : {}),
    ...(data.product.brand ? { brand: { "@type": "Brand", name: data.product.brand } } : {}),
    offers: {
      "@type": "Offer", priceCurrency: "INR", price: data.price.final.toFixed(2), url: `${origin}/product?slug=${encodeURIComponent(data.product.slug)}`,
      availability: data.stock === "out" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition",
    },
    ...(data.rating.count > 0 && data.rating.avg ? { aggregateRating: { "@type": "AggregateRating", ratingValue: data.rating.avg, reviewCount: data.rating.count } } : {}),
  };

  return (
    <ShopLayout {...layoutData} promo={home.promo} cartUi={cfg.cart}>
      {/* "<" escaped so text typed into a product can never close the script tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
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
