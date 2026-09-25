import { NextRequest, NextResponse } from "next/server";
import { appSession } from "@/lib/app-api";
import { syncSets } from "@/lib/app-sync";
import { withApiErrors } from "@/lib/api-errors";

/**
 * POST { have: { products: "<hash>", … }, only?: ["orders"] } → only the sets
 * that changed since the app last synced (see lib/app-sync.ts).
 */
async function handlePOST(req: NextRequest) {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  const body = await req.json().catch(() => ({}));
  const have = body && typeof body.have === "object" && body.have ? (body.have as Record<string, string>) : {};
  const only = Array.isArray(body.only) ? (body.only as unknown[]).filter((x): x is string => typeof x === "string") : undefined;
  const { sets, allowed } = await syncSets(s, have, only);
  return NextResponse.json({ success: true, serverTime: new Date().toISOString(), allowed, sets });
}

export const POST = withApiErrors(handlePOST);
