import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShopLayout } from "@/components/shop/ShopLayout";
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
      <div className="max-w-3xl mx-auto bg-white rounded-lg border border-storefront-border p-6 md:p-10">
        <h1 className="text-2xl font-bold mb-4">{page.title}</h1>
        <div className="prose max-w-none whitespace-pre-line text-storefront-text">{page.content}</div>
      </div>
    </ShopLayout>
  );
}
