import { NextRequest, NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staff-auth";
import { signAppToken } from "@/lib/app-token";
import { appProfile, latestRelease } from "@/lib/app-api";
import { withApiErrors } from "@/lib/api-errors";

/** Staff app sign-in: same checks as the website login; answers with a 30-day app token. */
async function handlePOST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await authenticateStaff(req, body.identity, body.password, `app ${String(body.platform ?? "").slice(0, 20)}`);
  if ("error" in auth) return auth.error;
  const { user, perms } = auth;
  const token = signAppToken(user, String(body.device ?? ""));
  const profile = await appProfile({ userId: user.id, username: user.username, email: user.email, role: user.role, permissions: perms });
  return NextResponse.json({ success: true, token, user: profile, release: await latestRelease() });
}

export const POST = withApiErrors(handlePOST);
