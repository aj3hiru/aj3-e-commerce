import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { isStaffHost, storeSiteOrigin } from "@/lib/seo";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** sitemap.xml for search engines: home, every active category and product, published pages. */
export async function GET() {
  if (await isStaffHost()) return new Response("Not found", { status: 404 });
  const origin = await storeSiteOrigin();
  const data = await cached("seo:sitemap", ["EcomProduct", "EcomCategory", "Page"], 60 * 60_000, () => Promise.all([
    prisma.ecomCategory.findMany({ where: { status: "active" }, select: { slug: true, updatedAt: true } }),
    prisma.ecomProduct.findMany({ where: { status: "active" }, select: { slug: true, updatedAt: true }, orderBy: { id: "desc" }, take: 45_000 }),
    prisma.page.findMany({ where: { status: "published" }, select: { slug: true, updatedAt: true } }),
  ]));
  const [cats, products, pages] = data;
  const url = (loc: string, at?: Date | null, pri = "0.6") =>
    `<url><loc>${esc(origin + loc)}</loc>${at ? `<lastmod>${at.toISOString().slice(0, 10)}</lastmod>` : ""}<priority>${pri}</priority></url>`;
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    url("/", null, "1.0"),
    ...cats.map((c) => url(`/category?slug=${encodeURIComponent(c.slug)}`, c.updatedAt, "0.8")),
    ...products.map((p) => url(`/product?slug=${encodeURIComponent(p.slug)}`, p.updatedAt, "0.7")),
    ...pages.map((p) => url(`/${encodeURIComponent(p.slug)}`, p.updatedAt, "0.4")),
    "</urlset>",
  ].join("\n");
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
