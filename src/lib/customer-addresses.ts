import { prisma } from "@/lib/db";

export type AddressType = "home" | "work" | "other";
export interface SavedAddress {
  id: number; name: string; phone: string; pincode: string; state: string; city: string; house: string; area: string;
  landmark: string; type: AddressType; lat: number | null; lng: number | null; isDefault: boolean;
}

type Row = { id: number; name: string; phone: string; pincode: string; state: string; city: string; house: string; area: string; landmark: string | null; type: string; lat: unknown; lng: unknown; isDefault: boolean };
export const toAddress = (r: Row): SavedAddress => ({
  id: r.id, name: r.name, phone: r.phone, pincode: r.pincode, state: r.state, city: r.city, house: r.house, area: r.area,
  landmark: r.landmark ?? "", type: (["home", "work", "other"].includes(r.type) ? r.type : "home") as AddressType,
  lat: r.lat === null ? null : Number(r.lat), lng: r.lng === null ? null : Number(r.lng), isDefault: r.isDefault,
});

export async function listAddresses(customerId: number): Promise<SavedAddress[]> {
  const rows = await prisma.ecomCustomerAddress.findMany({ where: { customerId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
  return rows.map(toAddress);
}

/** "Near City Hospital" (without doubling a "Near" the customer already typed). */
export const nearText = (landmark: string) => (/^(near|opp\.?|opposite|behind|beside)\b/i.test(landmark) ? landmark : `Near ${landmark}`);

/** One-line-per-part text used for orders and invoices. */
export const formatAddress = (a: Pick<SavedAddress, "name" | "phone" | "house" | "area" | "landmark" | "city" | "state" | "pincode">) =>
  [`${a.name}, ${a.phone}`, [a.house, a.area].filter(Boolean).join(", "), a.landmark ? nearText(a.landmark) : "", `${a.city}, ${a.state} - ${a.pincode}`].filter(Boolean).join("\n");

/** Validates and cleans an address form; returns an error message or the data. */
export function parseAddress(b: Record<string, unknown>): { error: string } | { data: Omit<SavedAddress, "id" | "isDefault"> & { isDefault: boolean } } {
  const s = (k: string, max: number) => String(b[k] ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const name = s("name", 100), phone = s("phone", 20).replace(/[^\d+]/g, ""), pincode = s("pincode", 10).replace(/\D/g, "");
  const house = s("house", 200), area = s("area", 200), city = s("city", 80), state = s("state", 60), landmark = s("landmark", 150);
  if (!name) return { error: "Please enter the full name." };
  if (phone.replace(/\D/g, "").length < 10) return { error: "Please enter a valid 10-digit mobile number." };
  if (!/^\d{6}$/.test(pincode)) return { error: "Please enter a valid 6-digit pincode." };
  if (!house) return { error: "Please enter the house no. / building name." };
  if (!area) return { error: "Please enter the road name / area / colony." };
  if (!city || !state) return { error: "Please enter the city and state." };
  const type = (["home", "work", "other"].includes(String(b.type)) ? b.type : "home") as AddressType;
  const num = (v: unknown, lim: number) => { const n = Number(v); return v !== null && v !== "" && v !== undefined && Number.isFinite(n) && Math.abs(n) <= lim ? Math.round(n * 1e7) / 1e7 : null; };
  let lat = num(b.lat, 90), lng = num(b.lng, 180);
  if (lat === null || lng === null) { lat = null; lng = null; }
  return { data: { name, phone, pincode, state, city, house, area, landmark, type, lat, lng, isDefault: b.isDefault === true } };
}
