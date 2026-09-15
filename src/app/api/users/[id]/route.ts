import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/password";
import { logActivity } from "@/lib/activity-log";

/** Verified against the edit_user branch in user-manager.php — password only
 *  updated if a new one was actually submitted. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "users", "edit")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number(id);
  const body = await req.json().catch(() => ({}));

  // Quick status-only update (matches the a_status active|pending|suspended field)
  if (body.status && Object.keys(body).length === 1) {
    if (!hasPermission(session.permissions, "users", "suspend")) {
      return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
    }
    const status = ["active", "pending", "suspended"].includes(body.status) ? body.status : "active";
    await prisma.user.update({ where: { id: userId }, data: { status } });
    return NextResponse.json({ success: true });
  }

  // Quick role-only update (matches ?toggle_role=ID&role=X)
  if (body.role && Object.keys(body).length === 1) {
    if (!hasPermission(session.permissions, "users", "change_roles")) {
      return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
    }
    if (!["admin", "editor", "author"].includes(body.role)) {
      return NextResponse.json({ success: false, message: "Invalid role." }, { status: 400 });
    }
    await prisma.user.update({ where: { id: userId }, data: { role: body.role } });
    return NextResponse.json({ success: true });
  }

  const username = (body.username ?? "").trim();
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  const role = ["admin", "editor", "author"].includes(body.role) ? body.role : "author";
  const permissions = body.permissions;

  if (!username || !email) {
    return NextResponse.json({ success: false, message: "Username and email are required." }, { status: 400 });
  }

  const dup = await prisma.user.findFirst({ where: { OR: [{ username }, { email }], id: { not: userId } } });
  if (dup) {
    return NextResponse.json({ success: false, message: "Username or email already exists." }, { status: 409 });
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        username,
        email,
        role,
        ...(permissions ? { permissions } : {}),
        ...(password.length >= 6 ? { passwordHash: await hashPassword(password) } : {}),
      },
    });

    await logActivity(req, session.userId, "user_edit", `Edited user ID: ${userId}`);

    return NextResponse.json({ success: true, redirect: "/admin/user-manager?success=updated" });
  } catch {
    return NextResponse.json({ success: false, message: "Username or email already exists." }, { status: 409 });
  }
}

/** Verified against the delete_user GET action — critically, prevents an
 *  admin from deleting their own account. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "users", "delete")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number(id);

  if (userId === session.userId) {
    return NextResponse.json({ success: false, message: "You cannot delete your own account." }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
    await logActivity(req, session.userId, "user_delete", `Deleted user ID: ${userId}`);
    return NextResponse.json({ success: true, message: "User deleted successfully." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unexpected error";
    return NextResponse.json({ success: false, message: `Delete failed: ${message}` }, { status: 500 });
  }
}
