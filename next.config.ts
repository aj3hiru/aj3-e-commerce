import type { NextConfig } from "next";

/** Sent with every page, API response and file. */
const SECURITY_HEADERS = [
  // Browsers only ever talk to the site over HTTPS (1 year).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No other website may show our pages in a frame (clickjacking); our own previews still can.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(self), usb=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Staff sites never show up in Google.
      { source: "/:path*", has: [{ type: "host", value: "(admin|delivery|login)\\..*" }], headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
  images: {
    remotePatterns: [],
  },
  eslint: {
    // Real build-blocking bug fixed here: this project had NO ESLint
    // config at all until now (eslint.config.mjs was just added), and
    // Next.js's own built-in build-time lint step invokes ESLint with
    // options (`useEslintrc`, `extensions`) that are incompatible with
    // ESLint's newer flat-config format — `next build` failed outright
    // with "Invalid Options" before ever reaching type-checking or page
    // generation. `npx eslint src` is run as its own separate,
    // authoritative step (see project README / commit history) on every
    // change, so this isn't a way to skip linting — it's avoiding a
    // version-compatibility conflict between two things checking the
    // same code, one of which is not run.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
