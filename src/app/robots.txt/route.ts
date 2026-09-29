import { isStaffHost, storeSiteOrigin } from "@/lib/seo";

/** robots.txt: the store is open to search engines (not carts, accounts or APIs); staff hosts are closed. */
export async function GET() {
  const body = (await isStaffHost())
    ? "User-agent: *\nDisallow: /\n"
    : [
        "User-agent: *",
        "Allow: /",
        ...["/api/", "/cart", "/checkout", "/account", "/wishlist", "/order", "/login", "/register", "/*?hc="].map((p) => `Disallow: ${p}`),
        "",
        `Sitemap: ${await storeSiteOrigin()}/sitemap.xml`,
        "",
      ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
