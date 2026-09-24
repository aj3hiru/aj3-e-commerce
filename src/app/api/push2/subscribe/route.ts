import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPushSettings } from "@/lib/push-settings";

/**
 * Public storefront endpoint — the Next.js replacement for
 * save-subscriptions.php (plus the VAPID public key push.js had hardcoded).
 *   GET    → { publicKey } so the browser can subscribe (404 when not configured)
 *   POST   → save a PushSubscription ({ endpoint, keys: { p256dh, auth } })
 *   DELETE → forget one ({ endpoint })
 */

// Only real browser push services. The queue worker POSTs to whatever endpoint
// is stored, so accepting any URL would let anyone make our server call
// arbitrary hosts (SSRF) and bloat every campaign with junk rows.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (new), Opera, Samsung, Brave
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)push\.apple\.com$/, // Safari / iOS web apps
  /(^|\.)notify\.windows\.com$/, // legacy Edge
  /^android\.googleapis\.com$/,
];
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function parseEndpoint(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 768) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(u.hostname)) ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const settings = await getPushSettings();
  if (!settings.configured) return NextResponse.json({ success: false, error: "Push notifications are not enabled." }, { status: 404 });
  return NextResponse.json({ success: true, publicKey: settings.publicKey }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const endpoint = parseEndpoint(body?.endpoint);
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || typeof p256dh !== "string" || typeof auth !== "string" ||
      !B64URL.test(p256dh) || !B64URL.test(auth) || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ success: false, error: "Invalid subscription" }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth },
    update: { p256dh, auth }, // same browser re-subscribing (e.g. after a key change)
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
