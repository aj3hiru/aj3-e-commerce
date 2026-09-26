import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appSession } from "@/lib/app-api";
import { sessionVersion } from "@/lib/session-cookies";
import { signWebCode } from "@/lib/app-web-login";
import { withApiErrors } from "@/lib/api-errors";

/** A 60-second, single-use code for opening a website page inside the staff app (see app-web-login). */
async function handlePOST() {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  const user = await prisma.user.findUnique({ where: { id: s.userId }, select: { id: true, passwordHash: true, status: true } });
  if (!user || user.status !== "active") return NextResponse.json({ success: false, auth: false, message: "Please log in again." }, { status: 401 });
  return NextResponse.json({ success: true, code: signWebCode(user.id, sessionVersion(user.passwordHash)) });
}

export const POST = withApiErrors(handlePOST);
