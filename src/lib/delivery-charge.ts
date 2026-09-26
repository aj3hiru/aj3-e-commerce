import { prisma } from "@/lib/db";
import { cached, invalidateModel } from "@/lib/cache";
import { DEFAULT_DELIVERY, sanitizeDelivery, type DeliverySettings } from "@/lib/delivery-charge-shared";

export * from "@/lib/delivery-charge-shared";

const KEY = "delivery";

export function getDeliverySettings(): Promise<DeliverySettings> {
  return cached("delivery-settings", ["StorefrontSetting"], 60_000, async () => {
    try {
      const row = await prisma.storefrontSetting.findUnique({ where: { key: KEY } });
      return sanitizeDelivery(row?.value ?? DEFAULT_DELIVERY);
    } catch {
      return DEFAULT_DELIVERY;
    }
  });
}

export async function saveDeliverySettings(input: unknown): Promise<DeliverySettings> {
  const value = sanitizeDelivery(input);
  await prisma.storefrontSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: value as unknown as object }, update: { value: value as unknown as object } });
  invalidateModel("StorefrontSetting");
  return value;
}
