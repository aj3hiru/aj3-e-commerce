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
