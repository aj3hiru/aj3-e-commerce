import type { Prisma } from "@prisma/client";

/** Looks up a coupon that can actually be redeemed right now: active, not
 *  paused, inside its starts/ends window, and under its usage limit. Shared by
 *  the storefront checkout and the POS billing checkout so the two can't drift. */
export async function findRedeemableCoupon(tx: Prisma.TransactionClient, code: string, now: Date) {
  if (code === "") return null;
  const found = await tx.ecomCoupon.findFirst({ where: { code, status: "active", isPaused: false } });
  if (!found) return null;
  if (found.startsAt && found.startsAt > now) return null;
  if (found.endsAt && found.endsAt < now) return null;
  if (found.usedCount >= found.numberOfTimes) return null;
  return found;
}

/** Atomically consumes one use. The increment takes a row lock, so re-reading
 *  afterwards tells us whether a concurrent checkout already used the last slot;
 *  returns false in that case so the caller can roll the whole transaction back. */
export async function consumeCouponUse(tx: Prisma.TransactionClient, couponId: number): Promise<boolean> {
  const updated = await tx.ecomCoupon.update({
    where: { id: couponId },
    data: { usedCount: { increment: 1 } },
    select: { usedCount: true, numberOfTimes: true },
  });
  return updated.usedCount <= updated.numberOfTimes;
}
