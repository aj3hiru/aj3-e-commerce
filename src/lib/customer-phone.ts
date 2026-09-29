import { prisma } from "@/lib/db";
import { phoneKey } from "@/lib/firebase-token";

/** The customer whose phone ends in the same 10 digits (online accounts first, then the oldest). */
export async function findCustomerByPhone(phone: string) {
  const key = phoneKey(phone);
  if (key.length < 10) return null;
  const rows = await prisma.ecomCustomer.findMany({ where: { phone: { contains: key.slice(-7) } }, orderBy: { id: "asc" } });
  const same = rows.filter((c) => c.phone && phoneKey(c.phone) === key);
  return same.find((c) => c.customerType === "online") ?? same[0] ?? null;
}

/** "+919876543210" → "+91 98765 43210" for display. */
export const prettyPhone = (p: string | null | undefined) => {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  return d.length === 12 && d.startsWith("91") ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : p;
};

/** A typed Indian mobile number ("+91 98765-43210", "098765 43210") → "9876543210", or null when it isn't one. */
export function normalizeMobile(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** Every customer with the same mobile number (last 10 digits), oldest first. */
export async function customersWithPhone(phone: string) {
  const key = phoneKey(phone);
  if (key.length < 10) return [];
  const rows = await prisma.ecomCustomer.findMany({ where: { phone: { contains: key.slice(-7) } }, orderBy: { id: "asc" } });
  return rows.filter((c) => c.phone && phoneKey(c.phone) === key);
}

/** Has its own login (an online account), as opposed to a customer made at the store counter. */
export const hasLogin = (c: { password: string | null; customerType: string }) => !!c.password || c.customerType === "online";
