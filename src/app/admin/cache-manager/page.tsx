import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { CacheManager2Body } from "@/components/admin/cache-manager2/CacheManager2Body";
import { CACHEMGR2_GROUPS, CACHEMGR2_PREF_KEY, CACHEMGR2_STANDALONE } from "@/components/admin/cache-manager2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getCacheStats } from "@/lib/cache-manager2";

/**
 * /admin/cache-manager2 — a trial redesign of Cache Manager, kept alongside
 * /admin/cache-manager so the two can be compared. Same access rule
 * (settings.maintenance_mode).
 *
 * Adds a real Redis layer (src/lib/redis.ts) on top of the granular
 * Next.js cache sections: a "Redis Cache" panel shows live connection
 * status, real key count and memory usage (Redis INFO/DBSIZE, not
 * estimated), and a Flush button. Redis is entirely optional — if
 * REDIS_URL isn't set, or Redis is unreachable, every read simply falls
 * through to the database (src/lib/redis.ts's `cached()` helper), so a
 * Redis problem can never take a page down. Currently only the Analytics
 * dashboard's heavy aggregation queries are wrapped in it
 * (src/lib/analytics2.ts, 60s TTL) — deliberately not every page, since
 * caching a lot of surfaces at once, right after several real production
 * outages this week, is the wrong tradeoff to make in a single pass.
 * More pages can be added the same way once this is proven stable.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/cache-manager2/
 *   src/components/admin/cache-manager2/
 *   src/app/api/cache2/
 *   src/lib/cache-manager2.ts
 *   src/lib/redis.ts (only if lib/analytics2.ts's `cached()` call is reverted too)
 */
export default async function CacheManager2Page() {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  if (!hasPermission(session.permissions, "settings", "maintenance_mode")) redirect("/admin/dashboard?denied=1");

  const stats = await getCacheStats();

  return (
    <DashboardWidgetPrefsProvider prefKey={CACHEMGR2_PREF_KEY} groups={CACHEMGR2_GROUPS} standalone={CACHEMGR2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Cache Manager"
        pageSubtitle="Refresh cached pages and Redis, section by section"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /></div>}
      >
        <div className="mb-5 flex justify-end xl:hidden"><DisplayOptionsPanel variant="toolbar" /></div>
        <CacheManager2Body stats={stats} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
