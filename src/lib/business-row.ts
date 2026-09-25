import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";

/** The Business Settings row (one per store), cached until it is saved again. */
export function getBusinessRow() {
  return cached("business-row", ["EcomBusinessSettings"], 60_000, () => prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } }));
}
