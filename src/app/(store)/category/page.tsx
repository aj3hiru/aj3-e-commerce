import { notFound } from "next/navigation";
import Link from "next/link";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { ProductFeed } from "@/components/shop/home/ProductFeed";
import { Page } from "@/components/shop/ui/Meesho";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getFeedFacets, getShopFeed, parseFeedFilters } from "@/lib/shop-feed";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

interface CategoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Category (Meesho style): subcategory chips, then the product feed with Sort / Brand / Filters. */
export default async function CategoryPage({ searchParams }: CategoryPageProps) {
  const raw = await searchParams;
  const slug = typeof raw.slug === "string" ? raw.slug : "";
  const sub = typeof raw.sub === "string" ? raw.sub : "";
  const category = await prisma.ecomCategory.findFirst({ where: { slug, status: "active" } });
  if (!category) notFound();

  const subcats = await prisma.ecomSubcategory.findMany({ where: { categoryId: category.id, status: "active" }, orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } });
  const activeSub = subcats.find((s) => s.slug === sub) ?? null;

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && k !== "slug") sp.set(k, v);
  const filters = { ...parseFeedFilters(sp), cat: [category.slug], sub: activeSub?.slug ?? "" };

  const [layoutData, customer, feed, facets] = await Promise.all([getShopLayoutData(), getCustomerSession(), getShopFeed(filters), getFeedFacets()]);
  const wishlisted = customer
    ? ((await prisma.ecomWishlist.findMany({ where: { customerId: customer.customerId }, select: { productId: true } })) as { productId: number }[]).map((w) => w.productId)
    : [];
  const base = `/category?slug=${encodeURIComponent(category.slug)}`;
  const chip = (on: boolean) => cn("shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-[14px] transition",
    on ? "border-[var(--hp-accent)] bg-[color-mix(in_srgb,var(--hp-accent)_9%,white)] font-medium text-[var(--hp-accent)]" : "border-[#dcdce6] bg-white text-[#353543]");

  return (
    <ShopLayout {...layoutData}>
      <Page title={category.name} back="/" wide>
        {subcats.length > 0 && (
          <div className="-mt-2 flex gap-2 overflow-x-auto bg-white px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href={base} className={chip(!activeSub)}>All</Link>
            {subcats.map((s) => <Link key={s.id} href={`${base}&sub=${encodeURIComponent(s.slug)}`} className={chip(activeSub?.id === s.id)}>{s.name}</Link>)}
          </div>
        )}
        <div className="bg-white">
          <ProductFeed key={`${category.slug}:${activeSub?.slug ?? ""}`} title={activeSub ? activeSub.name : `All ${category.name}`} initial={feed} filters={filters} facets={facets} wishlisted={wishlisted}
            bar={{ showSort: true, showCategory: false, showBrand: true, showFilters: true }}
            scope={{ cat: category.slug, sub: activeSub?.slug ?? "", path: activeSub ? `${base}&sub=${encodeURIComponent(activeSub.slug)}` : base }} />
        </div>
      </Page>
    </ShopLayout>
  );
}
