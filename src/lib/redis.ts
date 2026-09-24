import Redis from "ioredis";

/**
 * A deliberately defensive Redis wrapper. Redis here is a pure performance
 * optimization — every single function in this file must be safe to call
 * even when REDIS_URL is unset, Redis is down, or the password is wrong.
 * On any failure we log once and behave as a permanent cache-miss for the
 * rest of the process, rather than let a Redis problem become a site
 * outage the way the missing DATABASE_URL did.
 */

let client: Redis | null = null;
let attempted = false;
let broken = false;

function getClient(): Redis | null {
  if (broken) return null;
  if (client) return client;
  if (attempted) return null; // already tried once this process and it failed to even construct
  attempted = true;

  const url = process.env.REDIS_URL;
  if (!url) return null; // not configured — silently skip caching, not an error

  try {
    const c = new Redis(url, {
      maxRetriesPerRequest: 1, // fail fast instead of hanging a request
      retryStrategy: () => null, // don't keep reconnecting forever in the background
      lazyConnect: true,
      enableOfflineQueue: false, // never queue commands while disconnected — fail fast instead
    });
    c.on("error", (err) => {
      // ioredis requires an error listener or it crashes the process — this is that listener.
      console.error("[redis] connection error (falling back to database):", err.message);
      broken = true;
    });
    client = c;
    return c;
  } catch (err) {
    console.error("[redis] could not construct client:", err);
    return null;
  }
}

/** Get a cached JSON value, or null on any miss/error/misconfiguration. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  try {
    if (c.status !== "ready" && c.status !== "connecting") await c.connect();
    const raw = await c.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // any failure = cache miss, caller falls through to the database
  }
}

/** Set a cached JSON value with a TTL (seconds). Failure is silently ignored. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    if (c.status !== "ready" && c.status !== "connecting") await c.connect();
    await c.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    /* ignore — the page still works, it just wasn't cached this time */
  }
}

/** Delete every key under a prefix (e.g. "analytics:*"). Used by Cache Manager's Flush button. */
export async function cacheFlushPrefix(prefix: string): Promise<number> {
  const c = getClient();
  if (!c) return 0;
  try {
    if (c.status !== "ready" && c.status !== "connecting") await c.connect();
    let cursor = "0";
    let deleted = 0;
    do {
      const [next, keys] = await c.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
      cursor = next;
      if (keys.length) deleted += await c.del(...keys);
    } while (cursor !== "0");
    return deleted;
  } catch {
    return 0;
  }
}

/** Wraps an expensive async computation with a Redis cache. On any Redis
 *  problem this just calls `compute()` directly — the caller never sees
 *  the difference except in latency. */
export async function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await compute();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

export interface RedisStatus {
  configured: boolean;
  connected: boolean;
  keyCount: number | null;
  memoryUsedBytes: number | null;
  error: string | null;
}

/** Real, live status for the Cache Manager UI — never throws. */
export async function getRedisStatus(): Promise<RedisStatus> {
  if (!process.env.REDIS_URL) return { configured: false, connected: false, keyCount: null, memoryUsedBytes: null, error: null };
  const c = getClient();
  if (!c) return { configured: true, connected: false, keyCount: null, memoryUsedBytes: null, error: "Could not connect" };
  try {
    if (c.status !== "ready" && c.status !== "connecting") await c.connect();
    const [dbSize, info] = await Promise.all([c.dbsize(), c.info("memory")]);
    const memMatch = info.match(/used_memory:(\d+)/);
    return { configured: true, connected: true, keyCount: dbSize, memoryUsedBytes: memMatch ? Number(memMatch[1]) : null, error: null };
  } catch (err) {
    return { configured: true, connected: false, keyCount: null, memoryUsedBytes: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
