import { notFound } from "next/navigation";
import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { CategoryProductGrid } from "@/components/shop/CategoryProductGrid";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { campaignSalePrices } from "@/lib/campaign-pricing";

interface CategoryPageProps {
  searchParams: Promise<{ slug?: string; sub?: string }>;
}

const PAGE_SIZE = 20;

/** Verified against shop/category.php. */
export default async function CategoryPage({ searchParams }: CategoryPageProps) {
  const { slug, sub } = await searchParams;
  const layoutData = await getShopLayoutData();

  const category = await prisma.ecomCategory.findFirst({ where: { slug: slug ?? "", status: "active" } });
  if (!category) notFound();

  const subcats = await prisma.ecomSubcategory.findMany({
    where: { categoryId: category.id, status: "active" },
    orderBy: { name: "asc" },
  });

  const activeSubcat = sub ? subcats.find((sc: (typeof subcats)[number]) => sc.slug === sub) : undefined;

  const where = activeSubcat ? { status: "active", subcategoryId: activeSubcat.id } : { status: "active", categoryId: category.id };

  const [products, totalProducts] = await Promise.all([
    prisma.ecomProduct.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE_SIZE }),
    prisma.ecomProduct.count({ where }),
  ]);
  const hasMore = totalProducts > products.length;
  const campaign = await campaignSalePrices(products); // campaign prices, when a campaign is live

  return (
    <ShopLayout {...layoutData}>
      <nav className="text-xs text-storefront-muted mb-3">
        <Link href="/shop" className="text-storefront-muted">Home</Link> / <span className="text-storefront-text">{category.name}</span>
      </nav>

      <h2 className="text-lg font-bold mb-3">{category.name}</h2>

      {subcats.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-4 px-4">
          <Link
            href={`/shop/category?slug=${slug}`}
            className={cn("shrink-0 text-sm font-medium rounded-full px-4 py-1.5 border", !activeSubcat ? "bg-storefront-green text-white border-storefront-green" : "bg-white border-storefront-border")}
          >
            All
          </Link>
          {subcats.map((sc: (typeof subcats)[number]) => (
            <Link
              key={sc.id}
              href={`/shop/category?slug=${slug}&sub=${sc.slug}`}
              className={cn("shrink-0 text-sm font-medium rounded-full px-4 py-1.5 border whitespace-nowrap", activeSubcat?.id === sc.id ? "bg-storefront-green text-white border-storefront-green" : "bg-white border-storefront-border")}
            >
              {sc.name}
            </Link>
          ))}
        </div>
      )}

      {products.length === 0 ? (
        <div className="text-center py-16 text-storefront-muted">
          <PackageOpen className="w-10 h-10 mx-auto mb-3" />
          <p>No products in this category yet.</p>
        </div>
      ) : (
        <CategoryProductGrid
          initialProducts={products.map((p: (typeof products)[number]) => ({
            id: p.id, slug: p.slug, name: p.name, image: p.image,
            price: Number(p.price), salePrice: campaign.get(p.id) ?? (p.salePrice ? Number(p.salePrice) : null),
            productType: p.productType, stockQty: p.stockQty,
          }))}
          hasMore={hasMore}
          categoryId={category.id}
          subcategoryId={activeSubcat?.id ?? null}
        />
      )}
    </ShopLayout>
  );
}
