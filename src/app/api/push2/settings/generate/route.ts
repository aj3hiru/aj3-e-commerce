import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateVapidKeys, getPushSettings, keyFingerprint, savePushSettings } from "@/lib/push-settings";
import { withApiErrors } from "@/lib/api-errors";

/** Creates and saves a brand-new VAPID key pair (the one-click alternative to
 *  `npx web-push generate-vapid-keys`). Existing subscribers were created with
 *  the old pair; the storefront re-subscribes returning visitors automatically. */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "manage_templates")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const current = await getPushSettings();
  const subject = current.subject || `https://${req.headers.get("host") ?? "localhost"}`;
  const keys = generateVapidKeys();
  await savePushSettings({ ...keys, subject });
  await logActivity(req, session.userId, "push_settings_update",
    `Generated new push VAPID keys (${current.configured ? `replaced ${keyFingerprint(current.privateKey)}` : "first setup"} → ${keyFingerprint(keys.privateKey)})`);
  return NextResponse.json({ success: true, publicKey: keys.publicKey, fingerprint: keyFingerprint(keys.privateKey) });
}

export const POST = withApiErrors(handlePOST);
