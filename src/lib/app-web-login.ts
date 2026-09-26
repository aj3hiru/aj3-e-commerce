import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

/**
 * One-time code that lets the staff app open a website admin page inside the
 * app already signed in: the app (holding its Bearer token) asks for a code,
 * then loads /api/app/v1/web-login?code=… in its web view, which sets the
 * normal admin login cookie. Codes live 60 seconds and work once.
 */
const secret = () => `${process.env.ADMIN_JWT_SECRET}:app-web-login`;
const used = new Map<string, number>(); // jti → expiry (ms)

export function signWebCode(userId: number, pv: string): string {
  return jwt.sign({ userId, pv, jti: randomUUID() }, secret(), { expiresIn: 60, algorithm: "HS256" });
}

export function consumeWebCode(code: string): { userId: number; pv: string } | null {
  let p: { userId: number; pv: string; jti: string; exp: number };
  try {
    p = jwt.verify(code, secret(), { algorithms: ["HS256"] }) as typeof p;
  } catch {
    return null;
  }
  const now = Date.now();
  for (const [k, exp] of used) if (exp < now) used.delete(k);
  if (used.has(p.jti)) return null;
  used.set(p.jti, p.exp * 1000);
  return { userId: p.userId, pv: p.pv };
}
