#!/usr/bin/env bash
# Zero-downtime deploy on the server: build beside the live site, then swap.
# The old CSS/JS files are kept so pages already open in browsers keep working.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull -q
set -a; . ./.env.production; set +a
for f in prisma/*.sql; do :; done
npx prisma generate > /dev/null 2>&1
rm -rf .next-build
if ! NEXT_DIST_DIR=.next-build npx next build > /tmp/nb.log 2>&1; then
  tail -30 /tmp/nb.log; echo "BUILD FAILED — live site untouched"; rm -rf .next-build; exit 1
fi
tail -1 /tmp/nb.log
# Keep previous hashed assets (never overwrite new ones).
if [ -d .next/static ]; then cp -rn .next/static/. .next-build/static/ 2>/dev/null || true; fi
rm -rf .next-old
[ -d .next ] && mv .next .next-old
mv .next-build .next
pm2 restart sriandaltraders --update-env > /dev/null
sleep 6
code=$(curl -s -o /dev/null -w "%{http_code}" https://sriandaltraders.co.in/)
css=$(curl -s https://sriandaltraders.co.in/ | grep -o '/_next/static/css/[^"]*\.css' | head -1)
csscode=$(curl -s -o /dev/null -w "%{http_code}" "https://sriandaltraders.co.in${css}")
echo "home $code · css $csscode"
if [ "$code" != "200" ] || [ "$csscode" != "200" ]; then
  echo "Site check failed — rolling back"; rm -rf .next; mv .next-old .next; pm2 restart sriandaltraders --update-env > /dev/null; exit 1
fi
