import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, type AdminSession } from "@/lib/admin-auth";
import { roleLabel } from "@/lib/roles";

/** The signed-in staff member for an app request (Bearer token), or a 401 answer. */
export async function appSession(): Promise<AdminSession | NextResponse> {
  const s = await getAdminSession();
  return s ?? NextResponse.json({ success: false, auth: false, message: "Please log in again." }, { status: 401 });
}

export async function appProfile(session: AdminSession) {
  const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, username: true, firstName: true, lastName: true, email: true, phone: true, avatar: true, role: true, createdAt: true } });
  return {
    id: session.userId, username: session.username, name: [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || session.username,
    email: u?.email ?? session.email, phone: u?.phone ?? null, avatar: u?.avatar ?? null, role: session.role, roleLabel: roleLabel(session.role),
    since: u?.createdAt.toISOString() ?? null, permissions: session.permissions,
  };
}

/** Latest app release (public/app/latest.json, written by the release workflow). */
export async function latestRelease(): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await readFile(path.join(process.cwd(), "public", "app", "latest.json"), "utf8")); } catch { return null; }
}
