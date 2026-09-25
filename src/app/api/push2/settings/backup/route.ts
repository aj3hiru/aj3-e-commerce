import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { getPushSettings, keyFingerprint } from "@/lib/push-settings";
import { withApiErrors } from "@/lib/api-errors";

/** Downloads the VAPID key pair as a JSON backup — needed to move to a new
 *  server without losing subscribers. Contains the private key, so it is
 *  admin-only and every download is logged. */
async function handleGET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "manage_templates")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const s = await getPushSettings();
  if (!s.configured) return NextResponse.json({ success: false, error: "No keys saved yet." }, { status: 404 });
  await logActivity(req, session.userId, "push_keys_backup", `Downloaded push VAPID key backup (${keyFingerprint(s.privateKey)})`);
  const body = JSON.stringify({
    note: "VAPID key backup — keep this private. Paste these into Push Notifications → Settings on the new server, then import your subscribers.",
    publicKey: s.publicKey, privateKey: s.privateKey, subject: s.subject, exportedAt: new Date().toISOString(),
  }, null, 2);
  return new NextResponse(body, {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="push-vapid-keys-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}

export const GET = withApiErrors(handleGET);
