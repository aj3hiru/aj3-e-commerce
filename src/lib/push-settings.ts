import { createECDH, createHash } from "crypto";
import webpush from "web-push";
import { prisma } from "@/lib/db";

const KEYS = {
  publicKey: "push_vapid_public_key",
  privateKey: "push_vapid_private_key",
  subject: "push_vapid_subject",
} as const;

export interface PushSettings {
  publicKey: string;
  privateKey: string;
  subject: string;
  configured: boolean;
}

/** Reads VAPID settings from app_config — originally hardcoded PHP constants
 *  (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in includes/config.php),
 *  now stored so an admin can set/rotate them from the UI instead of editing code. */
export async function getPushSettings(): Promise<PushSettings> {
  const rows = await prisma.appConfig.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const map = new Map((rows as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const publicKey = map.get(KEYS.publicKey) ?? "";
  const privateKey = map.get(KEYS.privateKey) ?? "";
  const subject = map.get(KEYS.subject) ?? "";
  return { publicKey, privateKey, subject, configured: !!(publicKey && privateKey && subject) };
}

export async function savePushSettings(input: { publicKey: string; privateKey: string; subject: string }): Promise<void> {
  const entries: [string, string][] = [
    [KEYS.publicKey, input.publicKey.trim()],
    [KEYS.privateKey, input.privateKey.trim()],
    [KEYS.subject, input.subject.trim()],
  ];
  await Promise.all(entries.map(([key, value]) =>
    prisma.appConfig.upsert({ where: { key }, create: { key, value }, update: { value } })
  ));
}

/** A short, safe label for a key ("3fa2c1…9e07"): a SHA-256 of the key, so it
 *  can be shown and compared without revealing any of the key itself. */
export function keyFingerprint(key: string): string {
  if (!key) return "";
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

/** Checks a VAPID key pair: both well-formed and actually belonging together
 *  (the public key is derived from the private one). Returns an error message
 *  for the admin, or null when the pair is good. */
export function validateVapidPair(publicKey: string, privateKey: string): string | null {
  let pub: Buffer, priv: Buffer;
  try {
    pub = Buffer.from(publicKey.trim(), "base64url");
    priv = Buffer.from(privateKey.trim(), "base64url");
  } catch {
    return "Keys must be base64url text (letters, numbers, - and _).";
  }
  if (!/^[A-Za-z0-9_-]+=*$/.test(publicKey.trim()) || pub.length !== 65 || pub[0] !== 0x04) {
    return "The public key doesn't look right — it should be about 87 characters and start with \"B\".";
  }
  if (!/^[A-Za-z0-9_-]+=*$/.test(privateKey.trim()) || priv.length !== 32) {
    return "The private key doesn't look right — it should be about 43 characters.";
  }
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(priv);
    if (!ecdh.getPublicKey().equals(pub)) return "These two keys don't belong together — copy both from the same place.";
  } catch {
    return "The private key isn't a valid P-256 key.";
  }
  return null;
}

/** A brand-new VAPID key pair. */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  // web-push pads the private key to the full 32 bytes (Node may return fewer
  // when it starts with zero bytes).
  return webpush.generateVAPIDKeys();
}
