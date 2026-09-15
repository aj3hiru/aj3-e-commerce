import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/password";
import { logActivity } from "@/lib/activity-log";
import { getRolePermissionDefaults } from "@/lib/permissions";

/** Verified against the create_user action in user-manager.php. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "users", "create")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const username = (body.username ?? "").trim();
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  const role = ["admin", "editor", "author"].includes(body.role) ? body.role : "author";
  const permissions = body.permissions ?? getRolePermissionDefaults(role);

  if (!username || !email || !password) {
    return NextResponse.json({ success: false, message: "Username, email, and password are required." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ success: false, message: "Password must be at least 6 characters." }, { status: 400 });
  }

  const dup = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (dup) {
    return NextResponse.json({ success: false, message: "This username or email is already in use." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const created = await prisma.user.create({
    data: { username, email, passwordHash, role, permissions, status: "active" },
  });

  await logActivity(req, session.userId, "user_create", `Created user: ${username} (${role})`);

  return NextResponse.json({ success: true, redirect: "/admin/user-manager?success=created", userId: created.id });
}
