import webpush from "web-push";
import { prisma } from "@/lib/db";
import { getPushSettings } from "@/lib/push-settings";

/**
 * "Notify me" on out-of-stock products. A shopper's request is one
 * ecom_stock_alerts row; checkStockAlerts() runs every minute (instrumentation.ts)
 * and sends one "back in stock" push as soon as the product (or the chosen size)
 * can be bought again — however the stock came back (product edit, purchase,
 * return, staff app).
 */

const EXPIRE_DAYS = 180;
let running = false;

type P = { id: number; name: string; slug: string; image: string | null; status: string; productType: string; stockQty: number | null; sizes: { id: number; label: string; stockQty: number | null }[] };

/** Can it be bought again? Untracked stock (null) counts as available. */
function available(p: P, sizeId: number | null): boolean {
  if (p.status !== "active") return false;
  if (p.productType !== "physical") return true;
  if (p.stockQty !== null && p.stockQty <= 0) return false;
  if (!sizeId) return true;
  const z = p.sizes.find((x) => x.id === sizeId);
  return !z || z.stockQty === null || z.stockQty > 0;
}

export async function checkStockAlerts(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await prisma.ecomStockAlert.deleteMany({ where: { notifiedAt: null, createdAt: { lt: new Date(Date.now() - EXPIRE_DAYS * 86_400_000) } } });
    const pending = await prisma.ecomStockAlert.findMany({ where: { notifiedAt: null }, orderBy: { id: "asc" }, take: 500 });
    if (!pending.length) return;
    const products = await prisma.ecomProduct.findMany({
      where: { id: { in: [...new Set(pending.map((a) => a.productId))] } },
      select: { id: true, name: true, slug: true, image: true, status: true, productType: true, stockQty: true, sizes: { select: { id: true, label: true, stockQty: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p as P]));
    // Product deleted for good: nothing will ever come back.
    const gone = pending.filter((a) => !byId.has(a.productId)).map((a) => a.id);
    if (gone.length) await prisma.ecomStockAlert.deleteMany({ where: { id: { in: gone } } });

    const due = pending.filter((a) => { const p = byId.get(a.productId); return p && available(p, a.sizeId); });
    if (!due.length) return;
    const settings = await getPushSettings();
    if (!settings.configured) return;
    webpush.setVapidDetails(settings.subject, settings.publicKey, settings.privateKey);

    for (const a of due) {
      // Claim it first, so a second server process (during a deploy) never sends the same alert twice.
      const claimed = await prisma.ecomStockAlert.updateMany({ where: { id: a.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
      if (claimed.count !== 1) continue;
      const p = byId.get(a.productId)!;
      const size = a.sizeId ? p.sizes.find((z) => z.id === a.sizeId)?.label : null;
      const subs = await prisma.pushSubscription.findMany({
        where: { OR: [...(a.endpoint ? [{ endpoint: a.endpoint }] : []), ...(a.customerId ? [{ customerId: a.customerId }] : [])] },
        take: 10,
      });
      if (!subs.length) continue;
      const payload = JSON.stringify({
        title: "Back in stock 🎉",
        body: `${p.name}${size ? ` (${size})` : ""} is available again — order before it runs out.`,
        url: `/product?slug=${encodeURIComponent(p.slug)}`,
        ...(p.image ? { image: /^https:/.test(p.image) ? p.image : `/${p.image}` } : {}),
      });
      await Promise.all(subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 60 * 60, timeout: 10_000 });
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
      }));
    }
  } catch (e) {
    console.error("stock alerts failed", e);
  } finally {
    running = false;
  }
}
