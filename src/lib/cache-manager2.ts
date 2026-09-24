import { readdir, stat } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { cacheFlushPrefix, getRedisStatus, type RedisStatus } from "@/lib/redis";
import type { NextRequest } from "next/server";

export type CacheSection = "home" | "shop" | "blog" | "dashboard" | "all" | "redis";

const SECTION_LABEL: Record<CacheSection, string> = {
  home: "Homepage", shop: "Storefront Pages", blog: "Blog Posts", dashboard: "Admin Dashboard", all: "Everything", redis: "Redis Cache",
};

/** Recursively sums real file sizes under a directory — used to show the
 *  actual on-disk size of Next.js's Data Cache (.next/cache), not a guess.
 *  Caps at 20,000 files so a runaway cache folder can't hang the page. */
async function dirSize(dir: string, budget = { files: 20000 }): Promise<number> {
  let total = 0;
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0; // doesn't exist yet (e.g. cache was never populated)
  }
  for (const entry of entries) {
    if (budget.files <= 0) break;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full, budget);
    } else {
      budget.files--;
      try {
        total += (await stat(full)).size;
      } catch { /* file removed mid-scan, ignore */ }
    }
  }
  return total;
}

export interface CacheStats {
  cacheSizeBytes: number;
  publishedPostCount: number;
  totalClears: number;
  lastCleared: { at: string; by: string | null; section: string } | null;
  history: { id: number; at: string; by: string | null; description: string }[];
  redis: RedisStatus;
}

export async function getCacheStats(): Promise<CacheStats> {
  const [cacheSizeBytes, publishedPostCount, totalClears, lastEntry, historyRows, redis] = await Promise.all([
    dirSize(path.join(process.cwd(), ".next", "cache")),
    prisma.post.count({ where: { status: "published" } }),
    prisma.activityLog.count({ where: { actionType: "cache_clear" } }),
    prisma.activityLog.findFirst({ where: { actionType: "cache_clear" }, orderBy: { createdAt: "desc" }, include: { user: { select: { username: true } } } }),
    prisma.activityLog.findMany({ where: { actionType: "cache_clear" }, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { username: true } } } }),
    getRedisStatus(),
  ]);

  const parseSection = (description: string) => description.match(/\(([^)]+)\)\s*$/)?.[1] ?? "Unknown";

  return {
    cacheSizeBytes,
    publishedPostCount,
    totalClears,
    lastCleared: lastEntry ? { at: lastEntry.createdAt.toISOString(), by: lastEntry.user?.username ?? null, section: parseSection(lastEntry.description) } : null,
    history: (historyRows as { id: number; createdAt: Date; description: string; user: { username: string } | null }[]).map((r) => ({
      id: r.id, at: r.createdAt.toISOString(), by: r.user?.username ?? null, description: r.description,
    })),
    redis,
  };
}

/**
 * Actually clears Next.js's Full Route + Data Cache for the chosen section,
 * using the real route map (verified against src/app/*): "shop" busts the
 * whole /shop layout subtree in one call; "blog" enumerates every real
 * published Post.slug and revalidates its exact URL; "redis" flushes every
 * key this app writes into Redis (currently the analytics2:* keys —
 * lib/analytics2.ts). Nothing here is a placeholder path, and Redis
 * failing to flush (e.g. not configured) just reports 0 cleared rather
 * than erroring — the Next.js cache-clear is unaffected either way.
 */
export async function clearCacheSection(section: CacheSection, req: NextRequest, userId: number): Promise<{ pathsCleared: number }> {
  let count = 0;
  if (section === "home" || section === "all") {
    revalidatePath("/", "page");
    count++;
  }
  if (section === "shop" || section === "all") {
    revalidatePath("/shop", "layout");
    count++;
  }
  if (section === "blog" || section === "all") {
    const posts = await prisma.post.findMany({ where: { status: "published" }, select: { slug: true } });
    for (const p of posts as { slug: string }[]) {
      revalidatePath(`/${p.slug}`, "page");
      count++;
    }
  }
  if (section === "dashboard" || section === "all") {
    revalidatePath("/admin/dashboard", "page");
    count++;
  }
  if (section === "redis" || section === "all") {
    count += await cacheFlushPrefix("analytics2:");
  }

  await logActivity(req, userId, "cache_clear", `Cleared cache: ${count} item${count === 1 ? "" : "s"} (${SECTION_LABEL[section]})`);
  return { pathsCleared: count };
}
