import { ShopLayout } from "@/components/shop/ShopLayout";
import { ProductCard } from "@/components/shop/ProductCard";
import { Card2Product } from "@/components/shop/Card2Product";
import { BannerSlider } from "@/components/shop/BannerSlider";
import { HomeCategoryStrip } from "@/components/shop/HomeCategoryStrip";
import { CatCardsRow } from "@/components/shop/CatCardsRow";
import { FestiveBanner } from "@/components/shop/FestiveBanner";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { prisma } from "@/lib/db";
import { PackageSearch, Store } from "lucide-react";
import { campaignSalePrices } from "@/lib/campaign-pricing";

interface ShopHomePageProps {
  searchParams: Promise<{ q?: string }>;
}

/** Verified against shop/index.php. */
export default async function ShopHomePage({ searchParams }: ShopHomePageProps) {
  const layoutData = await getShopLayoutData();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  // ── Search mode: simple results grid, no homepage sections ──────────────
  if (query !== "") {
    const products = await prisma.ecomProduct.findMany({
      where: { status: "active", name: { contains: query } },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    const campaign = await campaignSalePrices(products); // campaign prices, when a campaign is live

    return (
      <ShopLayout {...layoutData}>
        <h2 className="text-lg font-bold mb-3">Search results for &quot;{query}&quot;</h2>
        {products.length === 0 ? (
          <div className="text-center py-16 text-storefront-muted">
            <PackageSearch className="w-10 h-10 mx-auto mb-3" />
            <p>No products found for your search.</p>
          </div>
        ) : (
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
            {products.map((p: (typeof products)[number]) => (
              <ProductCard
                key={p.id}
                product={{ id: p.id, slug: p.slug, name: p.name, image: p.image, price: Number(p.price), salePrice: campaign.get(p.id) ?? (p.salePrice ? Number(p.salePrice) : null), productType: p.productType, stockQty: p.stockQty }}
              />
            ))}
          </div>
        )}
      </ShopLayout>
    );
  }

  // ── Homepage ──────────────────────────────────────────────────────────────
  const [slides, homeSettingsRows, sections, allCategories] = await Promise.all([
    prisma.ecomHomeSlide.findMany({ where: { status: "active" }, orderBy: { sortOrder: "asc" } }),
    prisma.ecomHomeSetting.findMany(),
    prisma.ecomHomeSection.findMany({
      where: { status: "active" },
      orderBy: { sortOrder: "asc" },
      include: { items: { include: { category: true, product: true }, orderBy: { sortOrder: "asc" } }, category: true },
    }),
    prisma.ecomCategory.findMany({ where: { status: "active" }, orderBy: [{ serial: "asc" }, { name: "asc" }] }),
  ]);

  const homeSettings: Record<string, string> = {};
  for (const row of homeSettingsRows) homeSettings[row.settingKey] = row.settingValue;
  const stripMode = homeSettings.category_strip_mode ?? "pinned";
  const stripCount = Math.max(1, Number(homeSettings.category_strip_count ?? 10));

  const stripCategories =
    stripMode === "all"
      ? allCategories.slice(0, stripCount).map((c: (typeof allCategories)[number]) => ({ slug: c.slug, name: c.name, image: c.image }))
      : (
          await prisma.ecomHomeCategoryStrip.findMany({
            where: { category: { status: "active" } },
            include: { category: { select: { slug: true, name: true, image: true, status: true } } },
            orderBy: { sortOrder: "asc" },
          })
        ).map((s: { category: { slug: string; name: string; image: string | null } }) => ({ slug: s.category.slug, name: s.category.name, image: s.category.image }));

  // Auto category rows: every active category with products, excluding none (matches PHP: no exclusion logic)
  const autoCategoryRows = await Promise.all(
    allCategories.map(async (cat: (typeof allCategories)[number]) => {
      const products = await prisma.ecomProduct.findMany({
        where: { status: "active", categoryId: cat.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      return { category: cat, products };
    })
  );
  const autoCampaign = await campaignSalePrices(autoCategoryRows.flatMap((r) => r.products));

  return (
    <ShopLayout {...layoutData}>
      <BannerSlider slides={slides.map((s: (typeof slides)[number]) => ({ id: s.id, image: s.image, buttonLink: s.buttonLink }))} />

      <HomeCategoryStrip categories={stripCategories} />

      {sections.map((sec: (typeof sections)[number]) => {
        if (sec.sectionType === "manual_products") {
          const cards = sec.items
            .filter((it: (typeof sec.items)[number]) => it.productId && it.product)
            .map((it: (typeof sec.items)[number]) => ({ href: `/shop/product?slug=${it.product!.slug}`, image: it.product!.image, label: it.product!.name }));
          return <CatCardsRow key={sec.id} title={sec.title} cards={cards} />;
        }

        if (sec.sectionType === "category_row") {
          const itemCards = sec.items
            .filter((it: (typeof sec.items)[number]) => it.categoryId && it.category)
            .map((it: (typeof sec.items)[number]) => ({
              href: `/shop/category?slug=${it.category!.slug}`,
              image: it.customImage || it.category!.image,
              label: it.customLabel || it.category!.name,
            }));
          return <CatCardsRow key={sec.id} title={sec.title} cards={itemCards} />;
        }

        if (sec.sectionType === "festive_banner") {
          return (
            <FestiveBanner
              key={sec.id}
              banner={{ id: sec.id, bannerText: sec.bannerText, bannerImage: sec.bannerImage, title: sec.title, dismissible: sec.dismissible }}
            />
          );
        }

        // product_grid is resolved async below via IIFE-style await in a wrapper — see ProductGridSection
        return <ProductGridSectionServer key={sec.id} section={sec} />;
      })}

      {autoCategoryRows
        .filter((row) => row.products.length > 0)
        .map((row) => (
          <section key={row.category.id} className="mb-5">
            <h2 className="text-lg font-bold mb-2.5">{row.category.name}</h2>
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
              {row.products.map((p: (typeof row.products)[number]) => (
                <ProductCard
                  key={p.id}
                  product={{ id: p.id, slug: p.slug, name: p.name, image: p.image, price: Number(p.price), salePrice: autoCampaign.get(p.id) ?? (p.salePrice ? Number(p.salePrice) : null), productType: p.productType, stockQty: p.stockQty }}
                />
              ))}
            </div>
            <div className="text-center mt-3">
              <a href={`/shop/category?slug=${row.category.slug}`} className="inline-block bg-white border border-storefront-green text-storefront-green-dark text-xs font-bold rounded-full px-6 py-2.5">
                View More →
              </a>
            </div>
          </section>
        ))}

      {sections.length === 0 && slides.length === 0 && allCategories.length === 0 && (
        <div className="text-center py-16 text-storefront-muted">
          <Store className="w-10 h-10 mx-auto mb-3" />
          <p>The homepage hasn&apos;t been set up yet.</p>
        </div>
      )}
    </ShopLayout>
  );
}

/** Resolves and renders a single product_grid section — separated out because it
 *  needs its own async product query depending on source_type (manual/category/latest). */
async function ProductGridSectionServer({ section }: { section: { id: number; title: string | null; sourceType: string; categoryId: number | null; productLimit: number; cardDesign: string; items: { productId: number | null }[] } }) {
  const limit = Math.max(1, section.productLimit || 10);
  let products: Awaited<ReturnType<typeof prisma.ecomProduct.findMany>> = [];
  let viewMoreUrl: string | null = null;

  if (section.sourceType === "manual") {
    const ids = section.items.map((it) => it.productId).filter((id): id is number => !!id);
    if (ids.length > 0) {
      const found = await prisma.ecomProduct.findMany({ where: { id: { in: ids }, status: "active" } });
      const byId = new Map(found.map((p: (typeof found)[number]) => [p.id, p]));
      products = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
    }
  } else if (section.sourceType === "category" && section.categoryId) {
    products = await prisma.ecomProduct.findMany({ where: { status: "active", categoryId: section.categoryId }, orderBy: { createdAt: "desc" }, take: limit });
    const cat = await prisma.ecomCategory.findUnique({ where: { id: section.categoryId }, select: { slug: true } });
    if (cat) viewMoreUrl = `/shop/category?slug=${cat.slug}`;
  } else {
    products = await prisma.ecomProduct.findMany({ where: { status: "active" }, orderBy: { createdAt: "desc" }, take: limit });
  }

  if (products.length === 0) return null;

  const campaign = await campaignSalePrices(products);
  const design = (section.cardDesign || "design1") as "design1" | "design2" | "design3" | "design4";

  return (
    <section className="mb-5">
      {section.title && <h2 className="text-lg font-bold mb-2.5">{section.title}</h2>}
      <div className="grid grid-cols-1 md:[grid-template-columns:repeat(2,minmax(240px,1fr))] lg:[grid-template-columns:repeat(3,minmax(240px,1fr))] gap-[18px]">
        {products.map((p: (typeof products)[number]) => (
          <Card2Product
            key={p.id}
            design={design}
            product={{ id: p.id, slug: p.slug, name: p.name, image: p.image, price: Number(p.price), salePrice: campaign.get(p.id) ?? (p.salePrice ? Number(p.salePrice) : null), productType: p.productType, stockQty: p.stockQty }}
          />
        ))}
      </div>
      {viewMoreUrl && (
        <div className="text-center mt-3">
          <a href={viewMoreUrl} className="inline-block bg-white border border-storefront-green text-storefront-green-dark text-xs font-bold rounded-full px-6 py-2.5">
            View More →
          </a>
        </div>
      )}
    </section>
  );
}
