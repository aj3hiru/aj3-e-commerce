import jwt from "jsonwebtoken";

/**
 * Verifies a Firebase Authentication ID token without the Admin SDK or a
 * service account: signature against Google's published certificates, plus
 * issuer / audience = our project, not expired, and a verified phone number.
 */
const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let cache: { certs: Record<string, string>; until: number } | null = null;

async function certs(): Promise<Record<string, string>> {
  if (cache && cache.until > Date.now()) return cache.certs;
  const res = await fetch(CERTS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't reach Google to verify the OTP. Please try again.");
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  cache = { certs: await res.json(), until: Date.now() + Math.min(maxAge, 6 * 3600) * 1000 };
  return cache.certs;
}

export async function verifyFirebasePhoneToken(idToken: string, projectId: string): Promise<{ uid: string; phone: string }> {
  const decoded = jwt.decode(idToken, { complete: true });
  const kid = decoded && typeof decoded === "object" ? decoded.header.kid : undefined;
  if (!kid) throw new Error("Invalid verification.");
  let pem = (await certs())[kid];
  if (!pem) { cache = null; pem = (await certs())[kid]; } // keys rotate
  if (!pem) throw new Error("Invalid verification.");
  let p: { sub?: string; phone_number?: string; auth_time?: number };
  try {
    p = jwt.verify(idToken, pem, {
      algorithms: ["RS256"], audience: projectId, issuer: `https://securetoken.google.com/${projectId}`, clockTolerance: 60,
    }) as typeof p;
  } catch {
    throw new Error("Verification failed. Please request a new OTP and try again.");
  }
  if (!p.sub || !p.phone_number) throw new Error("This sign-in has no verified phone number.");
  // A fresh sign-in only: the OTP must have been entered in the last 10 minutes.
  if (!p.auth_time || Date.now() / 1000 - p.auth_time > 600) throw new Error("Verification expired. Please request a new OTP.");
  return { uid: p.sub, phone: p.phone_number };
}

/** Digits of an Indian (or other) mobile for matching: the last 10 digits. */
export const phoneKey = (phone: string) => phone.replace(/\D/g, "").slice(-10);
