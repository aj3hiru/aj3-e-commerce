import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPushSettings } from "@/lib/push-settings";
import { cleanSubscription, parseEndpoint } from "@/lib/push-subscriptions";

/**
 * Public storefront endpoint — the Next.js replacement for
 * save-subscriptions.php (plus the VAPID public key push.js had hardcoded).
 *   GET    → { publicKey } so the browser can subscribe (404 when not configured)
 *   POST   → save a PushSubscription ({ endpoint, keys: { p256dh, auth } })
 *   DELETE → forget one ({ endpoint })
 * Only endpoints on real browser push services are accepted (see lib/push-subscriptions.ts).
 */

export async function GET() {
  const settings = await getPushSettings();
  if (!settings.configured) return NextResponse.json({ success: false, error: "Push notifications are not enabled." }, { status: 404 });
  return NextResponse.json({ success: true, publicKey: settings.publicKey }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const sub = cleanSubscription(await req.json().catch(() => null));
  if (!sub) return NextResponse.json({ success: false, error: "Invalid subscription" }, { status: 400 });

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: sub,
    update: { p256dh: sub.p256dh, auth: sub.auth }, // same browser re-subscribing (e.g. after a key change)
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const endpoint = parseEndpoint(body?.endpoint);
  if (!endpoint) return NextResponse.json({ success: false, error: "Invalid subscription" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ success: true });
}
