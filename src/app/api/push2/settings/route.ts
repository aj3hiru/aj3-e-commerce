import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { getPushSettings, savePushSettings, validateVapidPair } from "@/lib/push-settings";
import { prisma } from "@/lib/db";
import { withApiErrors } from "@/lib/api-errors";

async function handleGET() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "manage_templates")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const settings = await getPushSettings();
  const subscriberCount = await prisma.pushSubscription.count();
  // Private key intentionally withheld from the response after the first save —
  // the form shows it masked and only sends a new value if the admin retypes it.
  return NextResponse.json({
    success: true,
    publicKey: settings.publicKey,
    subject: settings.subject,
    hasPrivateKey: !!settings.privateKey,
    configured: settings.configured,
    subscriberCount,
  });
}

async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "manage_templates")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const publicKey = String(body.publicKey ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const privateKeyInput = String(body.privateKey ?? "").trim();

  if (!publicKey || !subject) {
    return NextResponse.json({ success: false, error: "Public key and subject are required." }, { status: 400 });
  }
  if (!/^mailto:/.test(subject) && !/^https?:\/\//.test(subject)) {
    return NextResponse.json({ success: false, error: "Subject must start with mailto: or https://" }, { status: 400 });
  }

  const existing = await getPushSettings();
  const privateKey = privateKeyInput || existing.privateKey; // keep the old one if the masked field wasn't changed
  if (!privateKey) {
    return NextResponse.json({ success: false, error: "Private key is required." }, { status: 400 });
  }
  const pairError = validateVapidPair(publicKey, privateKey);
  if (pairError) return NextResponse.json({ success: false, error: pairError }, { status: 400 });

  await savePushSettings({ publicKey, privateKey, subject });
  await logActivity(req, session.userId, "push_settings_update", "Updated push notification VAPID settings");

  return NextResponse.json({ success: true });
}

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);
