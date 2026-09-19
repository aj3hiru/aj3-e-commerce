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

### Admin panel design fidelity pass

After the storefront pass above, the same line-by-line CSS verification was run
against `admin/ecommerce/components/ecom-head.php` (the admin `<style>` block that
every admin page loads). Confirmed correct already: the full color palette
(`--primary:#7c3aed` through the whole gray scale), the 280px sidebar grid, the
1600px content max-width, all `.nav-link` / `.nav-title` / `.brand-icon` sizing,
and the `statCard()` color map. Corrected:

13. **`AdminShell.tsx`** — the responsive padding was inverted: it had `p-6 sm:p-4`,
    which in Tailwind means 24px on small screens and 16px on large. The real CSS
    is the other way round (24px default, 16px only below 640px). Now `p-4 sm:p-6`.
14. **`AdminHeader.tsx`** — top-nav padding was 10px, real value is `0.45rem`; the
    dark-mode toggle had a tinted primary background where `.icon-btn` is
    transparent with a gray hover.
15. **Action buttons across all 12 CRUD tables** — were 32x32px with light tinted
    backgrounds (`bg-red-50 text-red-600` etc). The real `.action-list .btn` is
    **34x34px with solid brand-colored backgrounds** (`#4361ee` primary,
    `#858796` secondary, `#36b9cc` info, `#ef4444` danger) and white icons. A new
    shared `ActionButtons.tsx` (`ActionList` / `ActionButton` / `ActionLink`)
    centralizes this so all twelve tables stay consistent.
16. **Status pills across 10 tables** — used Tailwind's `emerald-500` (`#10b981`)
    and `admin-gray-400` (`#9ca3af`), but the real `.status-btn` palette is
    distinct: `#1cc88a` success, `#858796` secondary, `#f6c23e` warning. These are
    genuinely different values from the semantic `--success`/`--warning` tokens in
    the same stylesheet, so they're now separate named tokens
    (`admin-status-success` etc.) rather than being conflated.
17. **Table thumbnails** — were 48x48px; `table.dataTable img` is **55x55px**.
18. **Table headers across 16 tables** — were missing `font-weight:700`.
19. **Card containers across 34 files** — used a generic `rounded-lg border-gray-200`
    with no shadow. The real `.gd-card` is `border-radius:0.35rem`, `border:1px
    solid rgba(0,0,0,.08)`, `box-shadow:0 0.15rem 1.75rem 0 rgba(58,59,69,.1)` —
    now available as `rounded-card` / `border-card` / `shadow-card` tokens.

### Audit against the StoryTimes CMS handoff lessons

A handoff document from the parallel StoryTimes CMS migration (same person, same
server) listed ten categories of bug that shipped and were live-reported there.
This project was audited against each. Findings:

20. **Logout was reachable by GET, from a `<Link>` — a real shipped bug, lesson §5.5.**
    `AdminHeader` rendered `<Link href="/api/auth/logout">`, and the route exported a
    `GET` handler that performed the full logout (added deliberately to mimic the
    PHP's "visiting the URL logs you out" behaviour). Next.js prefetches `<Link>`
    targets whenever they enter the viewport, so the permanently-rendered user menu
    caused the browser to GET the logout route — and actually log the user out —
    on essentially every page load, with nobody clicking anything. Both logout
    routes are now **POST-only with no GET handler**, and both call sites use a real
    `<form method="POST">`. This is exactly the "randomly logged out" root cause
    described in the handoff.
21. **`ShopMobileDrawer` linked to `/shop/logout`, a route that never existed** — it
    404'd instead of logging out. Now a POST form to the real endpoint.
22. Audited and found **clean**: no `"use server"` modules at all (lesson §5.2 can't
    apply); `globals.css` brace-balanced (§5.1); every nullable-Prisma-column →
    non-nullable-prop path guarded with `?? ""` (§5.3 — the class of bug this
    sandbox's stubbed Prisma client cannot surface, checked manually against
    `schema.prisma` rather than trusting `tsc`); every JSON-column cast
    (`contactNumbers`, `socialMediaJson`, `permissions`, `config`) has a null
    fallback before being iterated; no other GET route performs a mutation.

**Caveat worth stating plainly** (handoff §5.3): `tsc` and `next build` passing in
this sandbox is *necessary but not sufficient*. The Prisma client here is a
network-blocked stub that resolves every query result to `any`, so type mismatches
between real generated Prisma types and component props are structurally invisible
locally. The manual schema cross-check above covers the known-risky paths, but the
first real `npm run build` on the server — with a genuinely generated client — is
the only thing that can prove the whole surface.

---

## Round 14 — dashboard, storefront header, business settings

Driven by a fresh drop of the PHP source (`edumint-ecommerce.zip`, 18 Sep). Four
requested changes, plus the defects an independent verification pass turned up
while checking them.

### 1. Storefront header (`ShopHeader.tsx`)

Re-ported against the current `shop/includes/shop-header.php`, which had moved on
from the copy the first port was built against.

- **Auth link now reads "Login"**, not "Sign In / Register". The latest PHP header
  already says `Login`; the mobile drawer in `shop-footer.php` still says "Sign In /
  Register", and was changed to "Login" too so the two don't disagree.
- **Address block restored.** The PHP `.location` box is two lines — the place name
  truncated to 12 chars with an inline chevron, then the street address truncated to
  18. Only the first line had been ported.
- **Delivery strip is now settings-driven**: label, time text and the two
  show/hide toggles, instead of a hardcoded "We're open" + `business_hours`.
- **Search placeholder** comes from settings instead of being hardcoded.
- **Breakpoint fixed to 901px.** The PHP switches desktop↔mobile at
  `max-width:900px` / `min-width:901px`; the port was using Tailwind's `md`
  (768px), flipping the header ~130px too early. A `shop:` screen was added.
- Mobile header metrics corrected (14/16 padding, 18px gaps, 24px green icons,
  the yellow `#fdd835` badge at `-8/14`, `#eee` search box at 6px radius).
- `mb_strimwidth()` counts its trim marker *inside* the width — `(…, 0, 18, '...')`
  is 15 chars + `...`, not 18 + `...`. See `strimwidth()`.

### 2. Business Settings — vertical menu (`SettingsMenuLayout.tsx`)

The horizontal `.settings-tabs` row became a WordPress-customizer-style vertical
menu: ten sections down the left, one panel on the right, one sticky Save bar that
submits all of them. The menu is buttons rather than links on purpose — switching
panels must not navigate, or an unsaved edit in another panel would be lost.

A new **Storefront Header** section holds the five header settings. Those stay
stored in `ecom_home_settings` under the PHP's own key names
(`show_location`, `show_delivery_info`, `delivery_label`, `delivery_time_text`,
`search_placeholder`) — only the *editor* moved, so an existing database needs no
migration and `shop-header.php` would still read them correctly. See
`lib/header-settings.ts`.

Field coverage was re-verified against the PHP: all 34 saved inputs are still
editable, with the same allow-lists, defaults and clamps.

### 3. Dashboard — exact CSS (`DateRangeBar`, `StatCard`, `DashboardSections`)

- The range bar's buttons are **Bootstrap defaults, not the admin purple**:
  `.btn-primary` `#0d6efd` for the active preset, `#6c757d` for
  `.btn-outline-secondary` and the Apply/Display Options buttons. Confirmed by
  grep — `ecom-head.php` overrides `.action-list .btn-primary` but never
  `.btn-primary` itself.
- Grid tiers corrected: `col-sm-6 col-lg-3` is Bootstrap's 576/992, not Tailwind's
  640/1024. Added `bs-sm:` / `bs-lg:` screens. Gutters are Bootstrap's
  1.5rem × 1rem, not a uniform 0.75rem.
- `.stat-card-e` now carries the heavy `0 .15rem 1.75rem 0 rgba(58,59,69,.1)` card
  shadow instead of `shadow-sm`, and the clickable hover lift.
- The Earnings section label regained its `fa-hand-holding-usd` icon; the Display
  Options panel regained its "Sections" divider.

### 4. Recent Orders — clickable (`StatusDropdown.tsx`)

Payment Status and Order Status are now the same editable `.status-btn` pills the
orders list uses — square corners (`border-radius:0` is an explicit Bootstrap
override), the CSS-triangle caret, the `$osClasses` colour map including
`.status-info-btn`. One shared component now backs both tables, so they cannot
drift. The order number was already a link and stays one.

**One deliberate addition beyond the PHP:** `Out for Delivery` joins the four
statuses `orders.php` defines, positioned between "In Progress" and "Delivered".
It is defined once in `lib/order-statuses.ts` and consumed by both tables, the
order detail view, the orders filter, both PATCH validators, the sales report
breakdown and the customer-facing tracker — adding it in one place only was how
three of the bugs below happened.

### Defects found by the verification pass and fixed

23. **Display Options toggled nothing until a page reload.**
    `useDashboardWidgetPrefs()` was a plain hook with its own `useState`,
    instantiated *twice* — once by the panel, once by the sections. Ticking a box
    updated localStorage and the panel's copy; the cards below never heard about
    it. The PHP has a single IIFE calling `applyVisibility()` straight from the
    change handler. Now a `DashboardWidgetPrefsProvider` context wrapping both.
    The panel also gained a `loaded` gate so it no longer paints every box checked
    before prefs load.
24. **`Out for Delivery` was silently dropped from the sales report breakdown** —
    the counts map was a hardcoded four-key literal behind an `undefined` guard, so
    the breakdown stopped summing to the online order total. Now seeded from
    `ORDER_STATUSES`, and an unknown stored status still gets counted.
25. **Orders page filter tiles hardcoded the same four** — `?type=Out+for+Delivery`
    was reachable by URL but had no tile and no count. Tiles are now generated from
    `ORDER_STATUSES`.
26. **Number formatting diverged from `number_format()` in every money column.**
    `toFixed(2)` emits no thousands separator at all (`₹1234567.89`), and
    `toLocaleString("en-IN")` groups lakh/crore (`12,34,567.89`) where PHP groups in
    threes (`1,234,567.89`). Added `lib/format.ts`; the en-US grouping is
    deliberate, because that is what the original site prints.
27. **The orders table had lost its "view order" button** — the PHP `.action-list`
    has a grey `#858796` eye linking to order-view *and* the red delete; only
    delete had been ported. Three column headings were also renamed
    (`Total Amount` / `Payment Status` / `Order Status` restored).
28. **Business Settings could wipe contact numbers on first save.** The PHP falls
    back to `[phone]` when `contact_numbers` is empty and to *all* contact numbers
    when `invoice_contact_numbers` is empty; the port passed `?? []` for both, so a
    legacy row opened with the fields blank and the next save persisted that blank.
29. **`extend.borderRadius` made literal radii 1.5–2× too large.** The config
    redefines `DEFAULT`→0.5rem and `lg`→0.75rem for the admin's `--radius` tokens,
    so every `rounded`/`rounded-lg` written against a literal PHP value came out
    wrong (`.stat-card-e` 0.5→0.75rem, `.btn-sm` 0.25→0.5rem, `.location` 8→12px,
    the logo 4→8px). Fixed by pinning the literals in the affected files rather
    than changing the global tokens, which dozens of already-verified components
    were written against.
30. **The storefront was rendering in Inter.** `shop-header.php` sets
    `font-family:'Segoe UI', Arial, Helvetica, sans-serif`; only the admin uses
    Inter. Added a `font-storefront` family, applied on the shop wrapper.

### Known, not fixed

- The orders-page summary tiles' *container* styling was corrected to `.stat-mini`
  (scrollable flex row, 0.75rem radius, light shadow, 1.375rem values in the admin
  `--warning`/`--info`/`--success`/`--danger` hexes) as part of #25. No other
  orders-page styling was touched.
- The POS billing screen, dashboard widget internals and form modals still have not
  had a pixel pass against `billing.php`'s own inline CSS.
- `prisma generate` still cannot run here (`binaries.prisma.sh` is 403 through the
  proxy), so the caveat above continues to apply: the stubbed client types every
  query as `any`, and only a real build on the server proves the whole surface.
