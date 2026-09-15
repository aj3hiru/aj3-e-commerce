import type { Config } from "tailwindcss";

// Color values below are copied verbatim from the original PHP CSS
// (shop/includes/shop-header.php for storefront, admin/ecommerce/components/ecom-head.php
// for admin) — do not "improve" or re-guess these, they are the exact source-of-truth hexes.

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Storefront theme (shop/*) ──
        storefront: {
          green: "#2e8b3d",
          "green-dark": "#1f6b2c",
          "green-light": "#eaf7ea",
          orange: "#ff7a00",
          text: "#1f2328",
          muted: "#6b7280",
          border: "#e5e7eb",
          bg: "#f7f8f7",
        },
        // ── Admin theme (admin/*) ──
        admin: {
          primary: "#7c3aed",
          "primary-dark": "#6d28d9",
          "primary-light": "#ede9fe",
          "primary-lighter": "#f5f3ff",
          success: "#10b981",
          warning: "#f59e0b",
          danger: "#ef4444",
          info: "#3b82f6",
          gray: {
            50: "#f9fafb",
            100: "#f3f4f6",
            200: "#e5e7eb",
            300: "#d1d5db",
            400: "#9ca3af",
            500: "#6b7280",
            600: "#4b5563",
            700: "#374151",
            800: "#1f2937",
            900: "#111827",
          },
        },
        // ── Mobile drawer accent (verified in shop-header.php around line 666) ──
        drawer: {
          accent: "#7c3aed",
          ink: "#1d1d1f",
        },
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.75rem",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      maxWidth: {
        "container-lg": "1140px",
        "admin-content": "1600px",
      },
      spacing: {
        "sidebar-width": "280px",
      },
    },
  },
  plugins: [],
};

export default config;
