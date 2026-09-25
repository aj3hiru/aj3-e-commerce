import { cache } from "react";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { prisma } from "./db";
import { sessionVersion } from "./session-cookies";
import { normalizePermissions } from "./permissions";

export interface AdminSession {
  userId: number;
  username: string;
  email: string;
  role: string;
  permissions: Record<string, Record<string, boolean>>;
}

/**
 * Mirrors the pattern repeated at the top of every admin/*.php file:
 *   if (!isset($_SESSION['user_id'])) exit('Access Denied');
 *   ... fetch user, check status==='active', check specific permission key ...
 *
 * NOTE: 'suspended' and 'pending' statuses are rejected at LOGIN time (see
 * login/route.ts) with specific messages — by the time a session exists here,
 * status should already be 'active'. This still re-checks status on every
 * request in case an admin was suspended mid-session, exactly like the PHP.
 */
async function loadAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET!, { algorithms: ["HS256"] }) as { userId: number; pv?: string };
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.status !== "active") return null;
    // Password changed since this session was issued -> session is revoked.
    if (payload.pv !== sessionVersion(user.passwordHash)) return null;

    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: normalizePermissions(user.permissions, user.role),
    };
  } catch {
    return null;
  }
}

export function hasPermission(
  permissions: Record<string, Record<string, boolean>>,
  group: string,
  key: string
): boolean {
  return !!permissions?.[group]?.[key];
}

/** Looked up once per request, however many components ask. */
export const getAdminSession: () => Promise<AdminSession | null> = cache(loadAdminSession);
