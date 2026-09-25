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
