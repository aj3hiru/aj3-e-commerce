#!/bin/bash
# Run this from ~/Desktop/aj3-ecommerce-push (repo root).
# Replaces /admin/file-manager and /admin/cache-manager with their "2"
# redesigns, deleting the old ones. Tested end-to-end (tsc + eslint +
# next build type-check all pass) before being handed to you.
set -e

if [ ! -f "package.json" ]; then
  echo "Run this from your project root (~/Desktop/aj3-ecommerce-push), not from elsewhere."
  exit 1
fi

rm -rf src/app/admin/file-manager
mv src/app/admin/file-manager2 src/app/admin/file-manager
echo "swapped: admin/file-manager"

rm -rf src/app/admin/cache-manager
mv src/app/admin/cache-manager2 src/app/admin/cache-manager
echo "swapped: admin/cache-manager"

echo ""
echo "DONE. Now run: npx tsc --noEmit   (should show zero errors)"
