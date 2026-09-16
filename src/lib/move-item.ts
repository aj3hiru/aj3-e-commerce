import { prisma } from "./db";

type SortableDelegate = {
  // Real regression fixed here: this typed its arguments as `any` at some
  // point (visible in the diff pulled from the live server as a change
  // FROM `unknown` TO `any`, with no explanation given anywhere for why).
  // `any` disables type-checking entirely on every call site that uses
  // this delegate; `unknown` is the type-safe choice — it still requires
  // the caller to narrow before use, which is exactly what's needed here
  // since this type is generic over whichever Prisma model gets passed in.
  findUnique: (args: unknown) => Promise<{ id: number; sortOrder: number } | null>;
  findFirst: (args: unknown) => Promise<{ id: number; sortOrder: number } | null>;
  update: (args: unknown) => Promise<unknown>;
};

/** Verified against moveItem($pdo, $table, $id, $direction) in homepage-settings.php:
 *  swaps sort_order with the adjacent row in the given direction. Generic over any
 *  model that has an `id` and `sortOrder` field. */
export async function moveItem(delegate: SortableDelegate, id: number, direction: "up" | "down", extraWhere: Record<string, unknown> = {}) {
  const current = await delegate.findUnique({ where: { id } });
  if (!current) return;

  const target = await delegate.findFirst({
    where: { sortOrder: direction === "up" ? { lt: current.sortOrder } : { gt: current.sortOrder }, ...extraWhere },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
  });
  if (!target) return;

  await delegate.update({ where: { id }, data: { sortOrder: target.sortOrder } });
  await delegate.update({ where: { id: target.id }, data: { sortOrder: current.sortOrder } });
}
