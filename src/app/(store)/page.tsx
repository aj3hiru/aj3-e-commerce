import type { Metadata } from "next";
import { getHomeCampaigns } from "@/lib/campaign-home";
import { CampaignOffers } from "@/components/shop/home/CampaignBanner";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { CategoryCircles } from "@/components/shop/home/CategoryCircles";
import { ProductFeed } from "@/components/shop/home/ProductFeed";
import { HomeRow } from "@/components/shop/home/HomeRow";
import { HomeBanner, ImageBanner, InfoStripBar, SectionGap } from "@/components/shop/home/HomeBlocks";
import { HomeTheme } from "@/components/shop/home/HomeTheme";
import { MobileBottomNav } from "@/components/shop/home/MobileBottomNav";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getFeedFacets, getProductRow, getShopFeed, parseFeedFilters } from "@/lib/shop-feed";
import { getDraftHome, getLiveHome } from "@/lib/home-config";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import type { HomeBlock } from "@/types/home";

interface ShopHomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: ShopHomePageProps): Promise<Metadata> {
  return (await searchParams).hc ? { robots: { index: false, follow: false } } : {};
}

/**
 * Storefront home in the style of Meesho's mobile site, built from the
 * Homepage Customizer (/admin/ecommerce/homepage-settings): offer strip above
 * the header, info strip, then the customizer's blocks in order (banner
 * slider, category circles, product rows, image banners, "Products For You"
 * feed with Sort/Category/Brand/Filters), and the bottom tab bar on phones.
 * ?hc=draft shows the unpublished draft — only to admins who can edit it.
 * A search (?q=) shows the same feed for the results.
 */
export default async function ShopHomePage({ searchParams }: ShopHomePageProps) {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") sp.set(k, v);
  const filters = parseFeedFilters(sp);

  let preview = false;
  if (raw.hc === "draft") {
    const admin = await getAdminSession();
    preview = !!admin && hasPermission(admin.permissions, "ecommerce", "manage_homepage");
  }

  const [layoutData, config, facets, feed] = await Promise.all([
    getShopLayoutData(), preview ? getDraftHome() : getLiveHome(), getFeedFacets(), getShopFeed(filters),
  ]);
  const wishlisted = layoutData.customer
    ? ((await prisma.ecomWishlist.findMany({ where: { customerId: layoutData.customer.id }, select: { productId: true } })) as { productId: number }[]).map((w) => w.productId)
    : [];
  const loggedIn = !!layoutData.customer;
  const feedBlock = config.blocks.find((b): b is Extract<HomeBlock, { type: "feed" }> => b.type === "feed" && b.enabled);
  const bar = feedBlock ?? { showSort: true, showCategory: true, showBrand: true, showFilters: true };

  // ── Search: just the results feed ─────────────────────────────────────────
  if (filters.q) {
    return (
      <ShopLayout {...layoutData} promo={config.promo}>
        <HomeTheme accent={config.accent} card={config.card}>
          <div className="-mx-8 -mt-6 shop:mx-0 shop:mt-0">
            <ProductFeed title={`Results for "${filters.q}"`} initial={feed} filters={filters} facets={facets} wishlisted={wishlisted} bar={bar} />
          </div>
          {config.bottomNav && <MobileBottomNav loggedIn={loggedIn} />}
        </HomeTheme>
      </ShopLayout>
    );
  }

  // ── Homepage ──────────────────────────────────────────────────────────────
  const categories = (await prisma.ecomCategory.findMany({
    where: { status: "active" }, orderBy: [{ serial: "asc" }, { name: "asc" }], select: { slug: true, name: true, image: true },
  })) as { slug: string; name: string; image: string | null }[];
  const blocks = config.blocks.filter((b) => b.enabled);
  // Campaign Offers switched to "Show on homepage" go just above the first "Products For You" feed.
  const campaigns = await getHomeCampaigns();
  const firstFeed = blocks.find((b) => b.type === "feed")?.id;
  const rows = new Map(await Promise.all(blocks.filter((b) => b.type === "products").map(async (b) => [b.id, await getProductRow(b as Extract<HomeBlock, { type: "products" }>)] as const)));

  const rendered = blocks.map((b, i) => <div key={b.id} data-hc={b.id}>{renderBlock(b, i)}</div>);
  function renderBlock(b: HomeBlock, i: number) {
    // Meesho's grey band separates product sections from what's above them.
    const gap = i > 0 && (b.type === "products" || b.type === "feed" || b.type === "image") ? <SectionGap /> : null;
    switch (b.type) {
      case "banner": return <HomeBanner key={b.id} slides={b.slides} autoplay={b.autoplay} rounded={b.rounded} />;
      case "categories": {
        const pick = b.source === "pick" ? b.slugs.map((s) => categories.find((c) => c.slug === s)).filter((c): c is (typeof categories)[number] => !!c) : categories;
        return <CategoryCircles key={b.id} strip={pick.slice(0, b.limit)} all={categories} showAllButton={b.showAllButton} />;
      }
      case "products": {
        const row = rows.get(b.id);
        if (!row || row.products.length === 0) return null;
        return <div key={b.id}>{gap}<HomeRow title={b.title} products={row.products} viewMoreUrl={row.viewAll} wishlisted={wishlisted} /></div>;
      }
      case "image": return b.image ? <div key={b.id}>{gap}<ImageBanner image={b.image} href={b.href} /></div> : null;
      case "feed": return (
        <div key={b.id}>
          {b.id === firstFeed && campaigns.length > 0 && <>{gap}<div className="shop:px-0"><CampaignOffers items={campaigns} /></div></>}
          {gap}
          <ProductFeed title={b.title} initial={feed} filters={filters} facets={facets} wishlisted={wishlisted} bar={b} />
        </div>
      );
    }
  }

  return (
    <ShopLayout {...layoutData} promo={config.promo}>
      <HomeTheme accent={config.accent} card={config.card}>
        {preview && (
          <div className="sticky top-0 z-[950] -mx-8 -mt-6 mb-6 bg-[#353543] px-4 py-1.5 text-center text-xs font-semibold text-white shop:mx-0 shop:mt-0">
            Preview of unpublished changes — shoppers still see the published homepage.
          </div>
        )}
        <div className="-mx-8 -mt-6 shop:mx-0 shop:mt-0">
          <div data-hc="strip"><InfoStripBar strip={config.strip} /></div>
          {rendered}
        </div>
        {config.bottomNav && <MobileBottomNav loggedIn={loggedIn} />}
      </HomeTheme>
    </ShopLayout>
  );
}
