import webpush from "web-push";
import { prisma } from "@/lib/db";
import { getPushSettings } from "@/lib/push-settings";

const MESSAGES: Record<string, (n: string) => { title: string; body: string }> = {
  "In Progress": (n) => ({ title: "Order accepted ✅", body: `Your order ${n} is confirmed and being packed.` }),
  "Out for Delivery": (n) => ({ title: "Out for delivery 🚚", body: `Your order ${n} is on the way.` }),
  Delivered: (n) => ({ title: "Delivered 🎉", body: `Your order ${n} has been delivered. Thank you for shopping with us!` }),
  Canceled: (n) => ({ title: "Order cancelled", body: `Your order ${n} was cancelled. Tap to see the details.` }),
};

/**
 * Tells the shopper about their online order's new status on the browsers /
 * phones where they allowed notifications while signed in. Never throws and
 * never delays the change itself (call it without awaiting).
 */
export async function notifyCustomerStatus(orderId: number, status: string): Promise<void> {
  try {
    const msg = MESSAGES[status];
    if (!msg) return;
    const o = await prisma.ecomOrder.findUnique({ where: { id: orderId }, select: { customerId: true, orderNumber: true, orderType: true } });
    if (!o?.customerId || o.orderType !== "online") return;
    const [subs, settings] = await Promise.all([
      prisma.pushSubscription.findMany({ where: { customerId: o.customerId }, take: 10 }),
      getPushSettings(),
    ]);
    if (!subs.length || !settings.configured) return;
    webpush.setVapidDetails(settings.subject, settings.publicKey, settings.privateKey);
    const payload = JSON.stringify({ ...msg(o.orderNumber), url: `/order?id=${orderId}` });
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 60 * 60, timeout: 10_000 });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      }
    }));
  } catch (e) {
    console.error("order status push failed", e);
  }
}
