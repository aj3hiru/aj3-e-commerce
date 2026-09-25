import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { appOfPath, staffHosts, toInternalPath, toPublicPath } from "@/lib/hosts";
import { sessionVersion } from "@/lib/session-cookies";

/**
 * Logging in on the login host, then landing logged in on the admin or
 * delivery host: each host keeps its own cookie (never shared with the
 * customers' domain), so the login host passes a one-time, 60-second link
 * to /auth/handoff on the target host, which sets that host's cookie.
 */

// Its own key, so a handoff link can never be used as a session token.
const secret = () => `${process.env.ADMIN_JWT_SECRET}:staff-handoff`;
const used = new Map<string, number>();

interface Handoff { u: number; pv: string; r: boolean; h: string; to: string }

/** "next" from the login page (a path, or a full URL on the admin / delivery host) → an internal staff path, or null. */
export function internalNext(next: unknown): string | null {
  if (typeof next !== "string" || !next) return null;
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return appOfPath(next) ? next : null;
  try {
    const u = new URL(next);
    const hosts = staffHosts();
    const app = u.hostname === hosts.admin && hosts.admin ? "admin" : u.hostname === hosts.delivery && hosts.delivery ? "delivery" : null;
    return app ? toInternalPath(u.pathname, app) + u.search : null;
  } catch { return null; }
}

/** Where to send the browser after a login: a handoff link to the path's own host, or null when that host isn't set up. */
export function handoffUrl(user: { id: number; passwordHash: string }, path: string, remember: boolean, proto: string): string | null {
  const app = appOfPath(path);
  const host = app ? staffHosts()[app] : "";
  if (!app || !host) return null;
  const [p, q = ""] = path.split("?");
  const to = toPublicPath(p, app) + (q ? `?${q}` : "");
  const t = jwt.sign({ u: user.id, pv: sessionVersion(user.passwordHash), r: remember, h: host, to } satisfies Handoff, secret(), { expiresIn: 60, jwtid: randomBytes(12).toString("hex") });
  return `${proto}://${host}/auth/handoff?t=${encodeURIComponent(t)}`;
}

/** Checks a handoff link for this host; each link works once. */
export function readHandoff(token: string, host: string): Handoff | null {
  try {
    const p = jwt.verify(token, secret()) as Handoff & { jti?: string; exp?: number };
    if (p.h !== host || !p.jti || used.has(p.jti)) return null;
    const now = Date.now();
    for (const [k, exp] of used) if (exp < now) used.delete(k);
    used.set(p.jti, (p.exp ?? 0) * 1000);
    return p;
  } catch { return null; }
}
