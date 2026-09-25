import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { createHash } from "crypto";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days — a reasonable default; adjust as needed

/** A short fingerprint of the account's current password hash, stored in the
 *  session token. Changing the password changes the fingerprint, so every
 *  session issued before the change stops verifying — no DB column needed. */
export function sessionVersion(passwordHash: string | null | undefined): string {
  return createHash("sha256").update(passwordHash ?? "").digest("hex").slice(0, 16);
}

/** remember = false: the cookie ends when the browser closes (and the token after 12 hours). */
export async function setAdminSessionCookie(userId: number, passwordHash: string, remember = true) {
  const token = jwt.sign({ userId, pv: sessionVersion(passwordHash) }, process.env.ADMIN_JWT_SECRET!, { expiresIn: remember ? SESSION_MAX_AGE : 60 * 60 * 12 });
  const cookieStore = await cookies();
  cookieStore.set("admin_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { maxAge: SESSION_MAX_AGE } : {}),
    path: "/",
  });
}

export async function setCustomerSessionCookie(customerId: number, passwordHash: string | null) {
  const token = jwt.sign({ customerId, pv: sessionVersion(passwordHash) }, process.env.CUSTOMER_JWT_SECRET!, { expiresIn: SESSION_MAX_AGE });
  const cookieStore = await cookies();
  cookieStore.set("customer_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_session");
}

export async function clearCustomerSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("customer_session");
}
