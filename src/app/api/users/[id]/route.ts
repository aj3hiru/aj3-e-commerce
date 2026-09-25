import { NextRequest, NextResponse } from "next/server";
import { isStaffRole } from "@/lib/roles";
import { parseStaffProfile } from "@/lib/staff";
import { getRolePermissionDefaults } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission, type AdminSession } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/password";
import { logActivity } from "@/lib/activity-log";
import { withApiErrors } from "@/lib/api-errors";

/** Verified against the edit_user branch in user-manager.php — password only
 *  updated if a new one was actually submitted. */
async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    if (userId === session.userId) {
      return NextResponse.json({ success: false, message: "You cannot change your own status." }, { status: 400 });
    }
    const guard = await guardTarget(userId, session);
    if (guard) return guard;
    const status = ["active", "pending", "suspended"].includes(body.status) ? body.status : "active";
    await prisma.user.update({ where: { id: userId }, data: { status } });
    return NextResponse.json({ success: true });
  }

  // Quick role-only update (matches ?toggle_role=ID&role=X)
  if (body.role && Object.keys(body).length === 1) {
    if (!hasPermission(session.permissions, "users", "change_roles")) {
      return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
    }
    if (!isStaffRole(body.role)) {
      return NextResponse.json({ success: false, message: "Invalid role." }, { status: 400 });
    }
    if (userId === session.userId) {
      return NextResponse.json({ success: false, message: "You cannot change your own role." }, { status: 400 });
    }
    if (body.role === "admin" && session.role !== "admin") {
      return NextResponse.json({ success: false, message: "Only an admin can grant the admin role." }, { status: 403 });
    }
    const guard = await guardTarget(userId, session);
    if (guard) return guard;
    await prisma.user.update({ where: { id: userId }, data: { role: body.role } });
    return NextResponse.json({ success: true });
  }

  const username = (body.username ?? "").trim();
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  if (!username || !email) {
    return NextResponse.json({ success: false, message: "Username and email are required." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
  const guard = await guardTarget(userId, session);
  if (guard) return guard;

  // Role and permissions only change when the editor holds the matching
  // permission and isn't editing themselves — users.edit alone must never be
  // enough to escalate anyone (including their own account). A missing role
  // keeps the current one instead of silently demoting to "author".
  const isSelf = userId === session.userId;
  const requestedRole = isStaffRole(body.role) ? body.role : target.role;
  const canChangeRole =
    !isSelf &&
    hasPermission(session.permissions, "users", "change_roles") &&
    (requestedRole !== "admin" || session.role === "admin");
  const role = canChangeRole ? requestedRole : target.role;
  const permissions =
    !isSelf && hasPermission(session.permissions, "users", "manage_permissions") && body.permissions
      ? body.permissions
      : role !== target.role ? getRolePermissionDefaults(role) : undefined; // a new role starts from its preset

  const prof = parseStaffProfile(body);
  if ("error" in prof) return NextResponse.json({ success: false, message: prof.error }, { status: 400 });
  const dup = await prisma.user.findFirst({ where: { OR: [{ username }, { email }, ...(prof.data.phone ? [{ phone: prof.data.phone }] : [])], id: { not: userId } } });
  if (dup) {
    return NextResponse.json({ success: false, message: dup.phone && dup.phone === prof.data.phone ? "This mobile number is already used by another staff member." : "Username or email already exists." }, { status: 409 });
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        username,
        email,
        role,
        ...prof.data,
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
async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "users", "delete")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number(id);

  if (userId === session.userId) {
    return NextResponse.json({ success: false, message: "You cannot delete your own account." }, { status: 400 });
  }
  const guard = await guardTarget(userId, session);
  if (guard) return guard;

  try {
    await prisma.user.delete({ where: { id: userId } });
    await logActivity(req, session.userId, "user_delete", `Deleted user ID: ${userId}`);
    return NextResponse.json({ success: true, message: "User deleted successfully." });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2003") return NextResponse.json({ success: false, message: "This user has sales, deliveries or activity on record, so they can't be deleted. Suspend them instead." }, { status: 409 });
    throw err;
  }
}

/** Only an admin may modify (edit, suspend, re-role, delete) an admin account —
 *  otherwise a staffer with users.edit could reset an admin's password and take
 *  the account over. */
async function guardTarget(userId: number, session: AdminSession) {
  if (session.role === "admin") return null;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (target?.role === "admin") {
    return NextResponse.json({ success: false, message: "Only an admin can modify an admin account." }, { status: 403 });
  }
  return null;
}

export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
