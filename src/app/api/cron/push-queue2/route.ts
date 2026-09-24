import { NextRequest, NextResponse } from "next/server";
import { processPushQueue } from "@/lib/push-manager2";

/**
 * Optional external trigger — wire a system cron (or a monitoring service)
 * to POST here every minute or so, same role as the original PHP's
 * cron-process-push-queue.php. Not required for normal use: /api/push2/send
 * already starts processing in the background right after queuing. This
 * exists purely for resilience — e.g. if the Node process restarted
 * mid-send and a campaign was left "processing" with rows still in
 * push_queue, this finishes it.
 *
 * Example crontab entry (adjust the secret and domain):
 *   * * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" https://yourdomain.com/api/cron/push-queue2
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (provided !== secret) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const result = await processPushQueue();
  return NextResponse.json({ success: true, ...result });
}
