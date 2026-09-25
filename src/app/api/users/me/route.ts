import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { setAdminSessionCookie } from "@/lib/session-cookies";
import { logActivity } from "@/lib/activity-log";
import { parseStaffProfile } from "@/lib/staff";
import { withApiErrors } from "@/lib/api-errors";

/** Verified against admin/my-profile.php's POST handler. */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const username = (body.username ?? "").trim();
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  const confirmPassword = body.confirmPassword ?? "";

  if (!username || !email) {
    return NextResponse.json({ success: false, message: "Username and email are required." }, { status: 400 });
  }
  if (password !== "" && password !== confirmPassword) {
    return NextResponse.json({ success: false, message: "New password and confirmation do not match." }, { status: 400 });
  }
  if (password !== "" && password.length < 6) {
    return NextResponse.json({ success: false, message: "New password must be at least 6 characters." }, { status: 400 });
  }
  if (password !== "") {
    // A hijacked or unattended session must not be able to lock the owner out.
    const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
    if (!(await verifyPassword(body.currentPassword ?? "", me?.passwordHash))) {
      return NextResponse.json({ success: false, message: "Your current password is incorrect." }, { status: 400 });
    }
  }

  const prof = parseStaffProfile(body);
  if ("error" in prof) return NextResponse.json({ success: false, message: prof.error }, { status: 400 });
  if (prof.data.phone) {
    const taken = await prisma.user.findFirst({ where: { phone: prof.data.phone, id: { not: session.userId } }, select: { id: true } });
    if (taken) return NextResponse.json({ success: false, message: "This mobile number is already used by another staff member." }, { status: 409 });
  }

  try {
    const newHash = password !== "" ? await hashPassword(password) : null;
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        username,
        email,
        ...prof.data,
        ...(newHash ? { passwordHash: newHash } : {}),
      },
    });
    // The password change revokes every older session; keep this one signed in.
    if (newHash) await setAdminSessionCookie(session.userId, newHash);

    await logActivity(req, session.userId, "profile_update", "Updated own profile");

    return NextResponse.json({ success: true, message: "Profile updated successfully!" });
  } catch {
    return NextResponse.json({ success: false, message: "Save failed: that username or email may already be in use." }, { status: 409 });
  }
}

export const POST = withApiErrors(handlePOST);
