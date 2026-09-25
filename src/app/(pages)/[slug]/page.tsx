import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { Page } from "@/components/shop/ui/Meesho";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { prisma } from "@/lib/db";

interface StaticPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: StaticPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await prisma.page.findFirst({ where: { slug, status: "published" } });
  if (!page) return {};
  return {
    title: page.metaTitle || page.title,
    description: page.metaDescription || undefined,
  };
}

/** Renders any published Page (created via /admin/pages) at its slug — e.g.
 *  /about-us, /privacy-policy, /terms-of-service. 404s if the slug doesn't
 *  exist or the page is still a draft. */
export default async function StaticPage({ params }: StaticPageProps) {
  const { slug } = await params;
  const [page, layoutData] = await Promise.all([
    prisma.page.findFirst({ where: { slug, status: "published" } }),
    getShopLayoutData(),
  ]);
  if (!page) notFound();

  return (
    <ShopLayout {...layoutData}>
      <Page title={page.title} back="/">
        <article className="bg-white px-4 py-5 text-[15px] leading-7 text-[#353543] shop:px-8 shop:py-8">
          <div className="whitespace-pre-line break-words">{page.content}</div>
        </article>
      </Page>
    </ShopLayout>
  );
}
