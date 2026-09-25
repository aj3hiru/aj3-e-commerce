/**
 * A small in-memory cache for read-mostly site data (business settings,
 * storefront / header / homepage config, categories, campaigns…).
 *
 * The database is on another machine (~20 ms a query), and every storefront
 * page needs this data, so reading it once and reusing it saves many round
 * trips per page. Each entry lists the Prisma models it depends on; any write
 * to one of them (see the hook in db.ts) drops the entry at once, so an admin's
 * change shows on the next page load. The TTL is only a safety net.
 */

type Entry = { at: number; ttl: number; deps: readonly string[]; value: Promise<unknown> };

const g = globalThis as unknown as { __siteCache?: Map<string, Entry> };
const store = (g.__siteCache ??= new Map());
const MAX_ENTRIES = 400; // feed filter combinations are the only open-ended keys

export function cached<T>(key: string, deps: readonly string[], ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = load();
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!); // oldest first
  store.set(key, { at: Date.now(), ttl: ttlMs, deps, value });
  // A failed load must not be served from the cache.
  value.catch(() => { if (store.get(key)?.value === value) store.delete(key); });
  return value;
}

/** Called after every write to `model` — drops what was built from it. */
export function invalidateModel(model: string | undefined) {
  if (!model) return;
  for (const [key, e] of store) if (e.deps.includes(model)) store.delete(key);
}

export function clearSiteCache() {
  store.clear();
}
