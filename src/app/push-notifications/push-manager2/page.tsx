import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { PushManager2Body, PushManager2HeaderButtons, type PushTab } from "@/components/admin/push-manager2/PushManager2Body";
import type { SubscribersData } from "@/components/admin/push-manager2/SubscribersTab";
import { PUSH2_GROUPS, PUSH2_PREF_KEY, PUSH2_STANDALONE } from "@/components/admin/push-manager2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { getPushCatalog } from "@/lib/push-catalog";
import { getCampaignHistory } from "@/lib/push-manager2";
import { getPushSettings } from "@/lib/push-settings";
import { BROWSER_LABEL, browserOf, subscriberBreakdown } from "@/lib/push-subscriptions";

const HISTORY_PAGE_SIZE = 10; // same as view-logs.php's $limit
const SUBSCRIBER_PAGE_SIZE = 20;

/**
 * /push-notifications/push-manager2 — the push notification manager rebuilt
 * from the original PHP screens:
 *   Compose     — admin_push.php, plus product / category / brand pickers with
 *                 filters, message templates and UTM tagging for the shop
 *   History     — view-logs.php (status, progress, sent/failed, pagination, delete)
 *   Subscribers — new: browser breakdown, list, import/export
 *   Settings    — new: VAPID keys stored in app_config (src/lib/push-settings.ts)
 * Every section can be shown/hidden from Display Options in the header.
 * Lists are read here on the server and paginated with ?tab=…&page=N.
 */
export default async function PushManager2Page({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "send")) redirect("/shop/login");

  const canManage = hasPermission(session.permissions, "push_notifications", "manage_templates");
  const sp = await searchParams;
  const requested = (sp.tab ?? "compose") as PushTab;
  const tab: PushTab =
    requested === "history" || ((requested === "settings" || requested === "subscribers") && canManage) ? requested : "compose";
  const pageParam = Math.max(1, Math.floor(Number(sp.page)) || 1);

  const [campaignTotal, subscriberTotal, totals, settings, catalog, business] = await Promise.all([
    prisma.pushCampaign.count(),
    prisma.pushSubscription.count(),
    prisma.pushCampaign.aggregate({ _sum: { sent: true, failed: true } }),
    getPushSettings(),
    getPushCatalog(),
    prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" }, select: { businessName: true } }),
  ]);

  const historyPageCount = Math.max(1, Math.ceil(campaignTotal / HISTORY_PAGE_SIZE));
  const historyPage = tab === "history" ? Math.min(historyPageCount, pageParam) : 1;
  const history = tab === "history" ? await getCampaignHistory(historyPage, HISTORY_PAGE_SIZE) : { rows: [], total: campaignTotal };

  let subscribers: SubscribersData | null = null;
  if (tab === "subscribers") {
    const pageCount = Math.max(1, Math.ceil(subscriberTotal / SUBSCRIBER_PAGE_SIZE));
    const page = Math.min(pageCount, pageParam);
    const [rows, breakdown, newThisWeek] = await Promise.all([
      prisma.pushSubscription.findMany({
        orderBy: { id: "desc" }, skip: (page - 1) * SUBSCRIBER_PAGE_SIZE, take: SUBSCRIBER_PAGE_SIZE,
        select: { id: true, endpoint: true, createdAt: true },
      }),
      subscriberBreakdown(),
      prisma.pushSubscription.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    ]);
    subscribers = {
      // Only the push-service host is shown — the full endpoint is a delivery address.
      rows: (rows as { id: number; endpoint: string; createdAt: Date }[]).map((r) => {
        const browser = browserOf(r.endpoint);
        let host = "";
        try { host = new URL(r.endpoint).hostname; } catch { /* keep blank */ }
        return { id: r.id, host, browser, browserLabel: BROWSER_LABEL[browser], createdAt: r.createdAt.toISOString() };
      }),
      total: subscriberTotal, page, pageCount, pageSize: SUBSCRIBER_PAGE_SIZE, newThisWeek, breakdown,
    };
  }

  const appName = business?.businessName || process.env.NEXT_PUBLIC_APP_NAME || "EduMint24";

  return (
    <DashboardWidgetPrefsProvider prefKey={PUSH2_PREF_KEY} groups={PUSH2_GROUPS} standalone={PUSH2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Push Notification Manager"
        pageSubtitle="Promote products, categories and offers with browser push"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /><PushManager2HeaderButtons canManage={canManage} /></div>}
      >
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" /><PushManager2HeaderButtons canManage={canManage} />
        </div>
        <PushManager2Body
          tab={tab}
          canManageSettings={canManage}
          appName={appName}
          siteUrl={process.env.NEXT_PUBLIC_SITE_URL || ""}
          catalog={catalog}
          stats={{ subscribers: subscriberTotal, campaigns: campaignTotal, sent: totals._sum.sent ?? 0, failed: totals._sum.failed ?? 0 }}
          history={{ rows: history.rows, total: history.total, page: historyPage, pageCount: historyPageCount, pageSize: HISTORY_PAGE_SIZE }}
          subscribers={subscribers}
          settings={{
            configured: settings.configured,
            // The private key never leaves the server — only whether one is saved.
            ...(canManage
              ? { publicKey: settings.publicKey, subject: settings.subject, hasPrivateKey: !!settings.privateKey }
              : { publicKey: "", subject: "", hasPrivateKey: false }),
          }}
        />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
