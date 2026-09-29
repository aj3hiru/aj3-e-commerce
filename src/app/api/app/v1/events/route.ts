import { NextRequest, NextResponse } from "next/server";
import { appSession } from "@/lib/app-api";
import { waitForEvents } from "@/lib/order-live";
import { withApiErrors } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * Live order feed (staff app and the admin site): GET ?after=<last id>&wait=25
 * waits until an order is placed / accepted / changed / assigned, so every
 * screen updates at once for everyone.
 */
async function handleGET(req: NextRequest) {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  const after = Math.max(0, Number(req.nextUrl.searchParams.get("after")) || 0);
  const wait = Math.min(30, Math.max(0, Number(req.nextUrl.searchParams.get("wait")) || 25)) * 1000;
  const r = await waitForEvents(after, s, wait, req.signal);
  return NextResponse.json({ success: true, ...r }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiErrors(handleGET);
