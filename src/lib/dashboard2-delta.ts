// Kept free of Prisma so client components and DB-free previews can use it.

export interface Delta {
  /** Percentage change vs. the previous period, or null when it is undefined. */
  pct: number | null;
  direction: "up" | "down" | "flat";
}

/**
 * Percentage change, with the two cases a naive `(now-prev)/prev` gets wrong:
 * dividing by zero, and "0 → 0" which is flat rather than a 100% rise.
 */
export function computeDelta(current: number, previous: number): Delta {
  if (previous === 0) {
    if (current === 0) return { pct: 0, direction: "flat" };
    // Growth from nothing has no meaningful percentage; the UI shows "New".
    return { pct: null, direction: "up" };
  }
  const pct = ((current - previous) / previous) * 100;
  return {
    pct: Math.round(pct * 10) / 10,
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
  };
}

