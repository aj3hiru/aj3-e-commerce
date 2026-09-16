# EduMint24 → Next.js — Complete + Pages + Ecommerce Analytics

Everything from before (full storefront, full admin ecommerce, full admin core,
generic Pages system), plus a new **product/sales Analytics dashboard**.

## About the Analytics feature — important context

I checked the original `admin/blog/analytics.php` before building this, and it's
**purely blog-post analytics** — page views, author performance, cache-file-backed
view counts. It has zero ecommerce or product content. So this isn't a port of
anything; it's a **new feature built for the ecommerce side**, using the same
verified tables (`ecom_orders`, `ecom_order_items`, `ecom_products`,
`ecom_categories`, `ecom_customers`) that the rest of the admin ecommerce section
already relies on. No schema changes were needed — everything this reads was
already correctly modeled by earlier phases.

## What's in the Analytics page (`/admin/ecommerce/analytics`)

- **Date range + order-type filters** — reuses the exact `DateRangeBar` component
  and `resolveDashboardRange()` logic from the Dashboard (Phase 5) and Sales History
  (Phase 8), plus a new All/Online/In-Store filter
- **Summary stat cards**: revenue, order count, units sold, average order value
- **Daily revenue trend**: a simple inline bar chart (no extra charting library
  dependency — deliberately lightweight) showing revenue per day across the
  selected range, with hover tooltips showing the exact figure and order count
- **Top Selling Products** and **Lowest Selling Products**: ranked by revenue,
  each linking straight to that product's edit page. Product numbers are computed
  from `EcomOrderItem` rows, which store a price/qty **snapshot at time of sale**
  (this was a deliberate design decision verified back in Phase 3's schema
  comments), so a product's historical performance stays accurate even if its
  price has since changed
- **Revenue by Category**: a simple proportional bar breakdown showing how much of
  total revenue in the period came from each category
- **Low Stock Alert**: physical products at 5 units or fewer, sorted lowest-first
- **New vs. Returning Customers**: within the selected date range

## Cumulative file list (new in this phase only)

```
src/lib/
  ecommerce-analytics.ts                  ★ NEW — all analytics data aggregation

src/components/admin/
  AnalyticsWidgets.tsx                     ★ NEW — top/worst products, category
                                             breakdown, low-stock alert, order-type filter

src/app/admin/ecommerce/analytics/page.tsx   ★ NEW
```

`admin-nav-config.ts` gained a new "Analytics" sidebar section (gated by the
existing `ecommerce.manage_orders` permission — no new permission needed).

## How to run it yourself

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
npx prisma generate
npx prisma migrate dev
npm run dev
```

Then visit http://localhost:3000/admin/ecommerce/analytics (requires
`ecommerce.manage_orders` permission) — plus every other page in the project as
documented in prior README history.

## Known sandbox limitation (unchanged throughout — read before assuming something's broken)

This development sandbox's network allowlist blocks `binaries.prisma.sh`, so
`@prisma/client` is an unconfigured stub here. **Re-isolated and re-confirmed for
this phase**: with all DB-touching routes/pages removed, the project builds and
statically prerenders with zero errors. `npx prisma generate` in your real
environment resolves this completely.

## What's intentionally NOT in this build

- The full blog/job-portal module (including its own blog-post analytics page) —
  replaced with the lighter-weight Pages system (previous phase) and this
  ecommerce-focused Analytics page (this phase), per instructions
- `cache-manager.php`, `category-manager.php` — see Phase 11b README history
- Push notification subscription flow, `middleware.ts` for centralized route
  protection, bulk ZIP-download in File Manager

## Project status

Feature-complete: full storefront, full admin ecommerce back-office (now including
product/sales analytics), full admin core, and a static-page system for one-off
content pages — everything a real EduMint24 deployment needs outside the blog module.

---

## Design Fidelity Cross-Check Session (post-completion)

After the project was marked complete, a careful line-by-line re-verification of
the storefront's exact CSS (not just colors, but real pixel values, layout
structure, and responsive behavior) against `shop/includes/shop-header.php`'s
`<style>` block found several real mismatches from the first implementation pass.
Fixed so far:

1. **`ProductCard.tsx`** — was missing the "MRP" label entirely; the discount badge
   was orange when it should be green-light background / green-dark text; the
   corner-badge vs. inline-badge responsive split (corner = mobile only, inline =
   desktop only) wasn't implemented at all.
2. **`Card2Product.tsx`** — the admin-facing design name → CSS class mapping was
   wrong (design3 actually maps to the "two-tone" CSS class, design4 to "compact
   chip" — not a 1:1 name match); design2's ribbon badge shows a percentage, not a
   rupee amount; the bottom row is two separate elements (a stock-status box + a
   separate Add to Cart button), not one merged button as first built.
3. **`ShopHeader.tsx`** — icon colors and cart-badge color were wrong (badge should
   be `#fdd835` yellow, not orange); the location pill was missing its green-light
   background.
4. **`ShopFooter.tsx`** — this was the single biggest miss: the real footer is a
   **dark footer** (`background:#241a3d`, near-white text at various opacities) with
   a 4-column grid and bullet-styled links. The first pass had built a plain white
   footer with dark text — visually the opposite of the real design.
5. **`ShopMobileDrawer.tsx`** — the drawer's accent color is its own purple
   (`#7c3aed`), separate from the storefront's green — the first pass used green
   throughout.
6. **`ShopLayout.tsx`** — page container max-width was wrong (1140px, a value that
   actually belongs to the *footer's* CSS variable, not the page container, which
   is really 1360px); body background was `bg-storefront-bg` (`#f7f8f7`) when the
   real body background is plain white — `--bg` is defined as a CSS variable but
   never actually applied to `body`.
7. **`BannerSlider.tsx`** — slide dots were rendered as an overlay on top of the
   image; the real design renders them as a separate static row below the slider.
8. **`HomeCategoryStrip.tsx`** — used a generic pastel color rotation instead of the
   7 real named colors (`#2f6fed`, `#dff2e3`, `#fdf1d8`, `#fbe4ea`, `#222`,
   `#e5f6e8`, `#eaf1ff`), two of which (c1, c5) need white text, not dark.
9. **`CatCardsRow.tsx`** — was built as a horizontally-scrolling row of small
   circular thumbnails; the real design is an 8-column CSS grid of large square
   cards with a light-blue placeholder background.
10. **`FestiveBanner.tsx`** — used the storefront's green-light background; the
    real design is a warm cream/orange gradient (`#fdf3e3` → `#fffaf0`) with two
    large leaf emoji absolutely positioned in the top corners, not inline text.
11. **Product grids across the storefront** (`shop/page.tsx`, `CategoryProductGrid.tsx`,
    `wishlist/page.tsx`) — were fixed-column-count grids (`grid-cols-2 sm:grid-cols-3...`);
    the real CSS is `repeat(auto-fill, minmax(230px, 1fr))`, a fundamentally
    different responsive strategy (as many columns as fit at ≥230px each, not
    fixed breakpoints).
12. Two unused, dead components (`PublicHeader.tsx`, `PublicFooter.tsx` — built in
    an early phase for the since-excluded blog section, never imported anywhere)
    were removed.

**What this means going forward**: this pass covered the storefront's shared
layout chrome (header, footer, mobile drawer) and homepage widgets (banner,
category strip, cat-cards, festive banner, product cards) in real depth. It did
**not** yet cover the same level of pixel-exact re-verification for: the cart page
body (partially checked — image size and grid split corrected), checkout form,
product detail page body, login/register page card layout, or any of the 46 admin
components. Those still reflect the original build's "correct structure and
color-token" pass rather than this session's "exact CSS value" pass. If pixel
fidelity matters for those too, they should go through the same process next.
