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
