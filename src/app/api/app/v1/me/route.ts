import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { readAppToken, signAppToken } from "@/lib/app-token";
import { appProfile, appSession, latestRelease } from "@/lib/app-api";
import { withApiErrors } from "@/lib/api-errors";

/** Who am I + my permissions now (they may have changed) + a renewed token + the latest app version. */
async function handleGET() {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  const raw = ((await headers()).get("authorization") ?? "").replace(/^Bearer\s+/, "");
  const t = readAppToken(raw);
  let token: string | null = null;
  // Renew once a day while the app is used, so an active device never gets logged out.
  if (t && (!t.iat || Date.now() / 1000 - t.iat > 86_400)) {
    const u = await prisma.user.findUnique({ where: { id: s.userId }, select: { id: true, passwordHash: true } });
    if (u) token = signAppToken(u, t.dev ?? "");
  }
  return NextResponse.json({ success: true, user: await appProfile(s), token, release: await latestRelease(), serverTime: new Date().toISOString() });
}

export const GET = withApiErrors(handleGET);
