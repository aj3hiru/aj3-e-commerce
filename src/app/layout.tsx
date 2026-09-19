import "./globals.css";
// Font Awesome's own sizing rules (.svg-inline--fa: 1em tall, -0.125em
// baseline shift). Imported here and autoAddCss turned off so the rules ship
// in the stylesheet instead of being injected by JS after hydration — which
// would otherwise flash every icon at full SVG size on first paint.
import "@fortawesome/fontawesome-svg-core/styles.css";
import { config } from "@fortawesome/fontawesome-svg-core";

config.autoAddCss = false;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
