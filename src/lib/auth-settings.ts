import { prisma } from "@/lib/db";
import { DEFAULT_AUTH, type AuthSettings } from "@/types/auth-settings";

const KEY = "auth";
type R = Record<string, unknown>;
const obj = (v: unknown): R => (v && typeof v === "object" ? (v as R) : {});
const str = (v: unknown, max: number, re?: RegExp) => { const s = typeof v === "string" ? v.trim().slice(0, max) : ""; return re && s && !re.test(s) ? "" : s; };

export function sanitizeAuth(input: unknown): AuthSettings {
  const r = obj(input), f = obj(r.firebase);
  return {
    otpEnabled: typeof r.otpEnabled === "boolean" ? r.otpEnabled : DEFAULT_AUTH.otpEnabled,
    passwordLogin: typeof r.passwordLogin === "boolean" ? r.passwordLogin : DEFAULT_AUTH.passwordLogin,
    countryCode: str(r.countryCode, 5, /^\+\d{1,4}$/) || DEFAULT_AUTH.countryCode,
    firebase: {
      apiKey: str(f.apiKey, 80, /^[\w-]+$/),
      authDomain: str(f.authDomain, 120, /^[a-z0-9.-]+$/i),
      projectId: str(f.projectId, 60, /^[a-z0-9-]+$/),
      appId: str(f.appId, 120, /^[\w:.-]+$/),
      messagingSenderId: str(f.messagingSenderId, 30, /^\d+$/),
    },
  };
}

export async function getAuthSettings(): Promise<AuthSettings> {
  try {
    const row = await prisma.storefrontSetting.findUnique({ where: { key: KEY } });
    return sanitizeAuth(row?.value ?? DEFAULT_AUTH);
  } catch {
    return DEFAULT_AUTH;
  }
}

export async function saveAuthSettings(input: unknown): Promise<AuthSettings> {
  const value = sanitizeAuth(input);
  await prisma.storefrontSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: value as unknown as object }, update: { value: value as unknown as object } });
  return value;
}
