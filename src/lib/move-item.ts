import { prisma } from "./db";

type SortableDelegate = {
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
