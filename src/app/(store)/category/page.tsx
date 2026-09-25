import { notFound } from "next/navigation";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { ProductFeed } from "@/components/shop/home/ProductFeed";
import { Page } from "@/components/shop/ui/Meesho";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getFeedFacets, getShopFeed, parseFeedFilters } from "@/lib/shop-feed";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/db";

interface CategoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Category (Meesho style): the product feed with Sort / Brand / Filters. */
export default async function CategoryPage({ searchParams }: CategoryPageProps) {
  const raw = await searchParams;
  const slug = typeof raw.slug === "string" ? raw.slug : "";
  const category = await prisma.ecomCategory.findFirst({ where: { slug, status: "active" } });
  if (!category) notFound();


  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && k !== "slug" && k !== "sub") sp.set(k, v);
  const filters = { ...parseFeedFilters(sp), cat: [category.slug], sub: "" };

  const [layoutData, customer, feed, facets] = await Promise.all([getShopLayoutData(), getCustomerSession(), getShopFeed(filters), getFeedFacets()]);
  const wishlisted = customer
    ? ((await prisma.ecomWishlist.findMany({ where: { customerId: customer.customerId }, select: { productId: true } })) as { productId: number }[]).map((w) => w.productId)
    : [];
  const base = `/category?slug=${encodeURIComponent(category.slug)}`;

  return (
    <ShopLayout {...layoutData}>
      <Page title={category.name} back="/" wide>
        <div className="bg-white">
          <ProductFeed key={category.slug} title={`All ${category.name}`} initial={feed} filters={filters} facets={facets} wishlisted={wishlisted}
            bar={{ showSort: true, showCategory: false, showBrand: true, showFilters: true }}
            scope={{ cat: category.slug, sub: "", path: base }} />
        </div>
      </Page>
    </ShopLayout>
  );
}
