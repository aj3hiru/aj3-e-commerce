import { prisma } from "./db";

type Row = { id: number; sortOrder: number };

// Generic over any Prisma model delegate that has an `id` + `sortOrder` field
// (ecomHomeSlide, ecomHomeCategoryStrip, ecomHomeSection, ...). Each real
// Prisma delegate's `findUnique`/`findFirst`/`update` methods are generic
// themselves with their own strict `where`/`data`/`orderBy` argument types,
// which differ per model — so this can't be pinned to one fixed argument
// shape (that was the earlier `unknown`-typed attempt, which TypeScript
// correctly rejects: a concrete Prisma delegate's methods take a specific
// object shape, not `unknown`, so they aren't assignable to a type that
// demands accepting `unknown`). Instead this stays generic over the whole
// delegate type `D`, using the same args/return shapes the delegate itself
// declares, so any Prisma model delegate satisfies it without a cast.
type SortableDelegate<TWhereUnique, TWhere, TOrderBy> = {
  findUnique: (args: { where: TWhereUnique }) => Promise<Row | null>;
  findFirst: (args: { where: TWhere; orderBy: TOrderBy }) => Promise<Row | null>;
  update: (args: { where: TWhereUnique; data: { sortOrder: number } }) => Promise<unknown>;
};

/** Verified against moveItem($pdo, $table, $id, $direction) in homepage-settings.php:
 *  swaps sort_order with the adjacent row in the given direction. Generic over any
 *  model that has an `id` and `sortOrder` field. */
export async function moveItem<TWhereUnique extends { id: number }, TWhere, TOrderBy>(
  delegate: SortableDelegate<TWhereUnique, TWhere, TOrderBy>,
  id: number,
  direction: "up" | "down",
  extraWhere: Record<string, unknown> = {},
) {
  const current = await delegate.findUnique({ where: { id } as TWhereUnique });
  if (!current) return;

  const target = await delegate.findFirst({
    where: {
      sortOrder: direction === "up" ? { lt: current.sortOrder } : { gt: current.sortOrder },
      ...extraWhere,
    } as TWhere,
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" } as TOrderBy,
  });
  if (!target) return;

  await delegate.update({ where: { id } as TWhereUnique, data: { sortOrder: target.sortOrder } });
  await delegate.update({ where: { id: target.id } as TWhereUnique, data: { sortOrder: current.sortOrder } });
}
