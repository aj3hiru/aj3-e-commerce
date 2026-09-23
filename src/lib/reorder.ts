type ReorderDelegate = {
  update: (args: { where: { id: number }; data: { sortOrder: number } }) => Promise<unknown>;
};

/** Given the list's new order as an array of ids, sets each row's sortOrder
 *  to its index (×10, leaving room to insert between rows later without a
 *  full renumber). Used by the homepage2 builder's drag-and-drop reorder. */
export async function reorderByIds(delegate: ReorderDelegate, orderedIds: number[]) {
  await Promise.all(orderedIds.map((id, i) => delegate.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } })));
}
