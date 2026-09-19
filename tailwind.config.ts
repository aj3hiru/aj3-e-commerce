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
      // The PHP used two different breakpoint systems, and Tailwind's defaults
      // match NEITHER — so both are declared here rather than approximated.
      //  • `shop`   = the storefront's own `@media (min-width:901px)` switch
      //               between .mobile-topbar and .topbar (shop-header.php).
      //               Tailwind's `md` is 768px, which would flip the header
      //               ~130px too early.
      //  • `bs-sm` / `bs-lg` = Bootstrap 5's 576/992 grid tiers, used by the
      //               admin's `col-sm-6 col-lg-3` stat-card grid. Tailwind's
      //               sm/lg are 640/1024, so reusing them would reflow the
      //               dashboard cards at the wrong widths.
      screens: {
        shop: "901px",
        "bs-sm": "576px",
        "bs-lg": "992px",
      },
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
          // Status-pill / action-button palette — verified from the
          // `.status-btn.*` and `.action-list .btn-*` rules in ecom-head.php.
          // These are deliberately DIFFERENT from the semantic tokens above
          // (e.g. status green is #1cc88a, not the #10b981 --success), so they
          // get their own names rather than being conflated.
          "status-success": "#1cc88a",
          "status-secondary": "#858796",
          "status-warning": "#f6c23e",
          "action-primary": "#4361ee",
          "action-info": "#36b9cc",
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
        // Verified from `.gd-card { border-radius: 0.35rem }` in ecom-head.php —
        // the admin card radius is noticeably tighter than the generic 0.5rem.
        card: "0.35rem",
      },
      boxShadow: {
        // Verified from `.gd-card { box-shadow: 0 0.15rem 1.75rem 0 rgba(58,59,69,.1) }`
        card: "0 0.15rem 1.75rem 0 rgba(58,59,69,.1)",
      },
      borderColor: {
        // Verified from `.gd-card { border: 1px solid rgba(0,0,0,.08) }`
        card: "rgba(0,0,0,.08)",
      },
      fontFamily: {
        // Admin theme (ecom-head.php loads Inter from Google Fonts).
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        // Storefront theme — shop-header.php's own stack. The two halves of
        // this app deliberately do NOT share a typeface.
        storefront: ["Segoe UI", "Arial", "Helvetica", "sans-serif"],
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
