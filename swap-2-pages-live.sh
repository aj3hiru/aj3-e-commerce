#!/bin/bash
# Run this from inside ~/Desktop/aj3-ecommerce-push (repo root).
# Replaces every v1 page with its "2" redesign at the ORIGINAL url, and
# deletes the old v1 page. Tested end-to-end (tsc + eslint + next build
# type-check all pass) against a fresh clone of the real repo before
# being handed to you.
set -e

if [ ! -f "package.json" ]; then
  echo "Run this from your project root (~/Desktop/aj3-ecommerce-push), not from elsewhere."
  exit 1
fi

# ── simple 1:1 pairs: delete v1, rename v2 to take its place ──
pairs="
activity-logs2:activity-logs
dashboard2:dashboard
ecommerce/analytics2:ecommerce/analytics
ecommerce/barcode-print2:ecommerce/barcode-print
ecommerce/billing2:ecommerce/billing
ecommerce/brands2:ecommerce/brands
ecommerce/campaign-offer2:ecommerce/campaign-offer
ecommerce/categories2:ecommerce/categories
ecommerce/coupons2:ecommerce/coupons
ecommerce/due2:ecommerce/due
ecommerce/homepage-settings2:ecommerce/homepage-settings
ecommerce/payment-settings2:ecommerce/payment-settings
ecommerce/product-reviews2:ecommerce/product-reviews
ecommerce/sales-history2:ecommerce/sales-history
ecommerce/stock-out-products2:ecommerce/stock-out-products
ecommerce/tax-settings2:ecommerce/tax-settings
user-manager2:user-manager
"
for pair in $pairs; do
  src="src/app/admin/${pair%%:*}"
  dst="src/app/admin/${pair##*:}"
  if [ -d "$src" ]; then
    rm -rf "$dst"
    mv "$src" "$dst"
    echo "swapped: $dst"
  fi
done

# ── nested-route pairs: products/add, products, customers, orders all have
#    child routes ([id], add) that must survive — only their own page.tsx moves ──
mkdir -p src/app/admin/ecommerce/products/add
cp src/app/admin/ecommerce/add-product2/page.tsx src/app/admin/ecommerce/products/add/page.tsx
rm -rf src/app/admin/ecommerce/add-product2
echo "swapped: ecommerce/products/add"

cp src/app/admin/ecommerce/products2/page.tsx src/app/admin/ecommerce/products/page.tsx
rm -rf src/app/admin/ecommerce/products2
echo "swapped: ecommerce/products"

cp src/app/admin/ecommerce/customers2/page.tsx src/app/admin/ecommerce/customers/page.tsx
rm -rf src/app/admin/ecommerce/customers2
echo "swapped: ecommerce/customers (customers/[id] untouched)"

cp src/app/admin/ecommerce/orders2/page.tsx src/app/admin/ecommerce/orders/page.tsx
rm -rf src/app/admin/ecommerce/orders2
echo "swapped: ecommerce/orders (orders/[id] untouched)"

# ── product-tags2 has no v1 — nav already expects the bare URL, just rename ──
rm -rf src/app/admin/ecommerce/product-tags
mv src/app/admin/ecommerce/product-tags2 src/app/admin/ecommerce/product-tags
echo "renamed: ecommerce/product-tags (no v1 existed)"

# ── fix every cross-page link/href that pointed at the old "2" urls ──
fix() {
  grep -rl "$1" src --include=*.tsx --include=*.ts 2>/dev/null | xargs -r sed -i '' "s#$1#$2#g"
}
fix '/admin/ecommerce/products2"'          '/admin/ecommerce/products"'
fix '/admin/ecommerce/products2?'          '/admin/ecommerce/products?'
fix '/admin/ecommerce/add-product2'        '/admin/ecommerce/products/add'
fix '/admin/ecommerce/stock-out-products2' '/admin/ecommerce/stock-out-products'
fix '/admin/ecommerce/orders2'             '/admin/ecommerce/orders'
fix '/admin/ecommerce/customers2'          '/admin/ecommerce/customers'
fix '/admin/ecommerce/due2'                '/admin/ecommerce/due'
fix '/admin/ecommerce/barcode-print2'      '/admin/ecommerce/barcode-print'
fix '/admin/ecommerce/campaign-offer2'     '/admin/ecommerce/campaign-offer'
fix '/admin/ecommerce/product-tags2'       '/admin/ecommerce/product-tags'
fix '/admin/ecommerce/product-reviews2'    '/admin/ecommerce/product-reviews'
fix '/admin/ecommerce/sales-history2'      '/admin/ecommerce/sales-history'
fix '/admin/dashboard2'                    '/admin/dashboard'

# ── pre-existing bug found during testing: dashboard2/page.tsx imports from
#    "@/components/admin/dashboard/..." (no "2") but the files were sitting
#    in ".../dashboard2/..." — nothing to do with this swap, just renaming
#    the folder to match what the page already expected. ──
if [ -d "src/components/admin/dashboard2" ] && [ ! -d "src/components/admin/dashboard" ]; then
  mv src/components/admin/dashboard2 src/components/admin/dashboard
  echo "fixed pre-existing bug: components/admin/dashboard (was dashboard2)"
fi

echo ""
echo "DONE. Now run: npx tsc --noEmit   (should show zero errors)"
