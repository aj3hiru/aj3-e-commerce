import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { PushSendError, processPushQueueUntilDone, queueCampaign } from "@/lib/push-manager2";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "send")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const message = String(body.body ?? "").trim();
  const url = String(body.url ?? "").trim();
  const image = body.image ? String(body.image).trim() : null;
  const postId = body.postId ? Number(body.postId) : null;

  try {
    const { campaignId, totalSubscribers } = await queueCampaign({ title, body: message, url, image, postId });
    await logActivity(req, session.userId, "push_send", `Sent Push Notification: ${title.slice(0, 50)} (Linked Post ID: ${postId ?? "N/A"}) — ${totalSubscribers} subscriber${totalSubscribers === 1 ? "" : "s"}`);

    // Start sending immediately in the background — the response doesn't wait
    // for this. If the server restarts mid-send, /api/cron/push-queue2 (wired
    // to a system cron, same idea as the original PHP cron) picks up any
    // "pending"/"processing" campaign left with rows still in push_queue.
    processPushQueueUntilDone().catch((e) => console.error("push queue processing failed", e));

    return NextResponse.json({ success: true, campaignId, totalSubscribers }, { status: 202 });
  } catch (e) {
    if (e instanceof PushSendError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("push2 send failed", e);
    return NextResponse.json({ success: false, error: "Could not queue the campaign. Please try again." }, { status: 500 });
  }
}
