import "./globals.css";
// Font Awesome's own sizing rules (.svg-inline--fa: 1em tall, -0.125em
// baseline shift). Imported here and autoAddCss turned off so the rules ship
// in the stylesheet instead of being injected by JS after hydration — which
// would otherwise flash every icon at full SVG size on first paint.
import "@fortawesome/fontawesome-svg-core/styles.css";
import { config } from "@fortawesome/fontawesome-svg-core";
import type { Metadata } from "next";
import { getBusinessRow } from "@/lib/business-row";
import { imageUrl, storeSiteOrigin } from "@/lib/seo";

config.autoAddCss = false;

/** Every page: "<page> | <business name>", the logo as tab icon and share image (WhatsApp, Facebook…). */
export async function generateMetadata(): Promise<Metadata> {
  const [biz, origin] = await Promise.all([getBusinessRow().catch(() => null), storeSiteOrigin()]);
  const name = biz?.businessName?.trim() || "Our Store";
  const description = `Shop online at ${name} — genuine products at the best prices, delivered to your door. Cash on Delivery available.`;
  const logo = imageUrl(origin, biz?.logo);
  return {
    metadataBase: new URL(origin),
    title: { default: name, template: `%s | ${name}` },
    description,
    applicationName: name,
    icons: { icon: "/favicon.ico" },
    openGraph: { type: "website", siteName: name, title: name, description, locale: "en_IN", ...(logo ? { images: [{ url: logo }] } : {}) },
    twitter: { card: "summary_large_image" },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
