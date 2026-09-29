import { headers } from "next/headers";
import { staffHosts, storeHostOf } from "@/lib/hosts";

/** The customers' site ("https://sriandaltraders.co.in") for the host this request came in on. */
export async function storeSiteOrigin(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  const proto = (h.get("x-forwarded-proto") ?? (local ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${storeHostOf(host.replace(/^www\./, "")) || "localhost:3000"}`;
}

/** True on the admin / delivery / login hosts — those are never for search engines. */
export async function isStaffHost(): Promise<boolean> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].split(":")[0].trim().toLowerCase();
  const s = staffHosts();
  return [s.admin, s.delivery, s.login].filter(Boolean).includes(host) || host.startsWith("login.");
}

/** Public URL of an uploaded image ("uploads/x.jpg" → "https://site/uploads/x.jpg"). */
export const imageUrl = (origin: string, img: string | null | undefined) => (!img ? undefined : /^https:/.test(img) ? img : `${origin}/${img.replace(/^\/+/, "")}`);
