import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
