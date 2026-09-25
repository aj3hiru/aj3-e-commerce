/** Helpers for staff accounts (users table): names, mobile numbers and where each role lands. */

/** Last 10 digits of an Indian mobile ("+91 98765-43210" → "9876543210"); "" if too short. */
export const staffPhone = (raw: unknown) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

export const staffName = (u: { firstName?: string | null; lastName?: string | null; username: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username;

/** Where a staff member goes after logging in: delivery agents get their own app. */
export function staffHome(role: string, permissions: Record<string, Record<string, boolean>>): string {
  const p = permissions;
  if (role === "delivery_agent" || (p.delivery?.deliver && !p.orders?.view && !p.ecommerce?.manage_billing && role !== "admin")) return "/agent";
  return "/admin/dashboard";
}

/** Cleans the optional profile fields sent by the user forms. `null` means "leave as is" for avatar. */
export function parseStaffProfile(b: Record<string, unknown>): { error: string } | { data: { firstName: string | null; lastName: string | null; phone: string | null; avatar?: string | null } } {
  const s = (k: string, max: number) => String(b[k] ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const firstName = s("firstName", 60) || null, lastName = s("lastName", 60) || null;
  const rawPhone = s("phone", 20);
  const phone = rawPhone ? staffPhone(rawPhone) : "";
  if (rawPhone && !phone) return { error: "Enter a valid 10-digit mobile number." };
  const data: { firstName: string | null; lastName: string | null; phone: string | null; avatar?: string | null } = { firstName, lastName, phone: phone || null };
  if (b.avatar === "" || b.avatar === null) data.avatar = null;
  else if (typeof b.avatar === "string" && /^uploads\/[\w./-]+\.(jpe?g|png|gif|webp)$/i.test(b.avatar) && !b.avatar.includes("..")) data.avatar = b.avatar;
  return { data };
}
