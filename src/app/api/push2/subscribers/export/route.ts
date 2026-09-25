import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/db";
import { getPushSettings } from "@/lib/push-settings";
import { BROWSER_LABEL, browserOf } from "@/lib/push-subscriptions";
import { withApiErrors } from "@/lib/api-errors";

/** Downloads every subscriber as CSV (default) or JSON. The keys in these rows
 *  let the holder of the matching VAPID private key message these browsers, so
 *  this is limited to admins who can manage push settings, and it is logged. */
async function handleGET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "manage_templates")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
  const rows = (await prisma.pushSubscription.findMany({ orderBy: { id: "asc" } })) as {
    id: number; endpoint: string; p256dh: string; auth: string; createdAt: Date;
  }[];
  const stamp = new Date().toISOString().slice(0, 10);
  await logActivity(req, session.userId, "push_subscribers_export", `Exported ${rows.length} push subscribers (${format.toUpperCase()})`);

  if (format === "json") {
    const settings = await getPushSettings();
    const body = JSON.stringify({
      exportedAt: new Date().toISOString(),
      // Subscriptions only work with the key pair they were created under.
      vapidPublicKey: settings.publicKey,
      count: rows.length,
      subscriptions: rows.map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth }, createdAt: r.createdAt.toISOString() })),
    }, null, 2);
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="push-subscribers-${stamp}.json"`, "Cache-Control": "no-store" },
    });
  }

  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["endpoint,p256dh,auth,browser,created_at"];
  for (const r of rows) lines.push([r.endpoint, r.p256dh, r.auth, BROWSER_LABEL[browserOf(r.endpoint)], r.createdAt.toISOString()].map(cell).join(","));
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="push-subscribers-${stamp}.csv"`, "Cache-Control": "no-store" },
  });
}

export const GET = withApiErrors(handleGET);
