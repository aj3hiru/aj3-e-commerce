import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days — a reasonable default; adjust as needed

export async function setAdminSessionCookie(userId: number) {
  const token = jwt.sign({ userId }, process.env.ADMIN_JWT_SECRET!, { expiresIn: SESSION_MAX_AGE });
  const cookieStore = await cookies();
  cookieStore.set("admin_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function setCustomerSessionCookie(customerId: number) {
  const token = jwt.sign({ customerId }, process.env.CUSTOMER_JWT_SECRET!, { expiresIn: SESSION_MAX_AGE });
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
