import jwt from "jsonwebtoken";
import { sessionVersion } from "./session-cookies";

/**
 * Login token for the staff app (Android / Windows). Sent as
 * "Authorization: Bearer <token>" and accepted by every admin API exactly like
 * the website's login cookie — same user, same permissions, same checks.
 * Signed with its own key (so a website cookie can't be used as an app token),
 * valid 30 days and renewed by /api/app/v1/me while the app is in use.
 * Changing the password ends every app login, like on the website.
 */
const TTL = 60 * 60 * 24 * 30;
const secret = () => `${process.env.ADMIN_JWT_SECRET}:staff-app`;

export function signAppToken(user: { id: number; passwordHash: string }, device: string): string {
  return jwt.sign({ userId: user.id, pv: sessionVersion(user.passwordHash), dev: device.slice(0, 80) }, secret(), { expiresIn: TTL, algorithm: "HS256" });
}

export function readAppToken(token: string): { userId: number; pv?: string; dev?: string; iat?: number } | null {
  try {
    return jwt.verify(token, secret(), { algorithms: ["HS256"] }) as { userId: number; pv?: string; dev?: string; iat?: number };
  } catch {
    return null;
  }
}
