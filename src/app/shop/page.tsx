import { ShopLayout } from "@/components/shop/ShopLayout";
import { BannerSlider } from "@/components/shop/BannerSlider";
import { CatCardsRow } from "@/components/shop/CatCardsRow";
import { FestiveBanner } from "@/components/shop/FestiveBanner";
import { CategoryCircles } from "@/components/shop/home/CategoryCircles";
import { ProductFeed } from "@/components/shop/home/ProductFeed";
import { HomeRow } from "@/components/shop/home/HomeRow";
import { MobileBottomNav } from "@/components/shop/home/MobileBottomNav";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { FEED_SELECT, enrichProducts, getFeedFacets, getShopFeed, parseFeedFilters, publicProducts, type FeedRow } from "@/lib/shop-feed";
import { prisma } from "@/lib/db";

interface ShopHomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Storefront home, in the style of Meesho's mobile site (used at every screen
 * size): banner slider → round category shortcuts → the admin's homepage
 * sections → "Products For You" with Sort / Category / Brand / Filters and
 * endless scrolling, plus a bottom tab bar on phones. The site header and
 * footer are unchanged. A search (?q=) shows the same feed for the results.
 */
export default async function ShopHomePage({ searchParams }: ShopHomePageProps) {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") sp.set(k, v);
  const filters = parseFeedFilters(sp);

  const [layoutData, facets, feed] = await Promise.all([getShopLayoutData(), getFeedFacets(), getShopFeed(filters)]);
  const wishlisted = layoutData.customer
    ? ((await prisma.ecomWishlist.findMany({ where: { customerId: layoutData.customer.id }, select: { productId: true } })) as { productId: number }[]).map((w) => w.productId)
    : [];

  const feedEl = (
    <ProductFeed title={filters.q ? `Results for "${filters.q}"` : "Products For You"} initial={feed} filters={filters} facets={facets} wishlisted={wishlisted} />
  );

  // ── Search: just the results feed ─────────────────────────────────────────
  if (filters.q) {
    return (
      <ShopLayout {...layoutData}>
        <div className="-mx-8 -mt-6 shop:mx-0 shop:mt-0">{feedEl}</div>
        <MobileBottomNav loggedIn={!!layoutData.customer} />
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
  const circle = (c: { slug: string; name: string; image: string | null }) => ({ slug: c.slug, name: c.name, image: c.image });
  const stripCategories =
    stripMode === "all"
      ? allCategories.slice(0, stripCount).map(circle)
      : (
          await prisma.ecomHomeCategoryStrip.findMany({
            where: { category: { status: "active" } },
            include: { category: { select: { slug: true, name: true, image: true } } },
            orderBy: { sortOrder: "asc" },
          })
        ).map((s: { category: { slug: string; name: string; image: string | null } }) => circle(s.category));

  return (
    <ShopLayout {...layoutData}>
      <div className="-mx-8 -mt-6 shop:mx-0 shop:mt-0">
        {slides.length > 0 && (
          <div className="px-3 shop:px-0">
            <BannerSlider slides={slides.map((s: (typeof slides)[number]) => ({ id: s.id, image: s.image, buttonLink: s.buttonLink }))} />
          </div>
        )}

        <CategoryCircles strip={stripCategories} all={allCategories.map(circle)} />

        {sections.map((sec: (typeof sections)[number]) => {
          if (sec.sectionType === "manual_products") {
            const cards = sec.items
              .filter((it: (typeof sec.items)[number]) => it.productId && it.product)
              .map((it: (typeof sec.items)[number]) => ({ href: `/shop/product?slug=${it.product!.slug}`, image: it.product!.image, label: it.product!.name }));
            return <div key={sec.id} className="px-4 shop:px-0"><CatCardsRow title={sec.title} cards={cards} /></div>;
          }
          if (sec.sectionType === "category_row") {
            const cards = sec.items
              .filter((it: (typeof sec.items)[number]) => it.categoryId && it.category)
              .map((it: (typeof sec.items)[number]) => ({
                href: `/shop/category?slug=${it.category!.slug}`,
                image: it.customImage || it.category!.image,
                label: it.customLabel || it.category!.name,
              }));
            return <div key={sec.id} className="px-4 shop:px-0"><CatCardsRow title={sec.title} cards={cards} /></div>;
          }
          if (sec.sectionType === "festive_banner") {
            return (
              <div key={sec.id} className="px-3 shop:px-0">
                <FestiveBanner banner={{ id: sec.id, bannerText: sec.bannerText, bannerImage: sec.bannerImage, title: sec.title, dismissible: sec.dismissible }} />
              </div>
            );
          }
          return <ProductRowSection key={sec.id} section={sec} wishlisted={wishlisted} />;
        })}

        <div className="border-t-8 border-[#f5f5f8] shop:border-t-0">{feedEl}</div>
      </div>
      <MobileBottomNav loggedIn={!!layoutData.customer} />
    </ShopLayout>
  );
}

/** An admin "product grid" section (manual / category / latest products) as a swipeable row. */
async function ProductRowSection({ section, wishlisted }: {
  section: { id: number; title: string | null; sourceType: string; categoryId: number | null; productLimit: number; items: { productId: number | null }[] };
  wishlisted: number[];
}) {
  const limit = Math.max(1, section.productLimit || 10);
  let rows: FeedRow[] = [];
  let viewMoreUrl: string | null = null;

  if (section.sourceType === "manual") {
    const ids = section.items.map((it) => it.productId).filter((id): id is number => !!id);
    if (ids.length > 0) {
      const found = (await prisma.ecomProduct.findMany({ where: { id: { in: ids }, status: "active" }, select: FEED_SELECT })) as FeedRow[];
      const byId = new Map(found.map((p) => [p.id, p]));
      rows = ids.map((id) => byId.get(id)).filter((p): p is FeedRow => !!p);
    }
  } else if (section.sourceType === "category" && section.categoryId) {
    rows = (await prisma.ecomProduct.findMany({ where: { status: "active", categoryId: section.categoryId }, orderBy: { createdAt: "desc" }, take: limit, select: FEED_SELECT })) as FeedRow[];
    const cat = await prisma.ecomCategory.findUnique({ where: { id: section.categoryId }, select: { slug: true } });
    if (cat) viewMoreUrl = `/shop/category?slug=${cat.slug}`;
  } else {
    rows = (await prisma.ecomProduct.findMany({ where: { status: "active" }, orderBy: { createdAt: "desc" }, take: limit, select: FEED_SELECT })) as FeedRow[];
    viewMoreUrl = "/shop?sort=new";
  }
  if (rows.length === 0) return null;
  const products = publicProducts(await enrichProducts(rows));
  return <HomeRow title={section.title} products={products} viewMoreUrl={viewMoreUrl} wishlisted={wishlisted} />;
}
