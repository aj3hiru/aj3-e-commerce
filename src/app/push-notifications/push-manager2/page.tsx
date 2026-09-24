import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PushManager2Body, type PushTab } from "@/components/admin/push-manager2/PushManager2Body";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { getCampaignHistory } from "@/lib/push-manager2";
import { getPushSettings } from "@/lib/push-settings";

const HISTORY_PAGE_SIZE = 10; // same as view-logs.php's $limit

/**
 * /push-notifications/push-manager2 — the push notification manager rebuilt
 * from the original PHP screens, kept alongside /push-notifications/push-manager
 * so the two can be compared:
 *   Compose  — admin_push.php (post picker, manual fields, live lock-screen preview)
 *   History  — view-logs.php (status, progress, sent/failed, pagination, delete)
 *   Settings — new: VAPID keys stored in app_config (src/lib/push-settings.ts)
 * Sending/deleting/settings go through /api/push2/*; the history list is
 * read here on the server and paginated with ?tab=history&page=N.
 */
export default async function PushManager2Page({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "send")) redirect("/shop/login");

  const canManageSettings = hasPermission(session.permissions, "push_notifications", "manage_templates");
  const sp = await searchParams;
  const requested = (sp.tab ?? "compose") as PushTab;
  const tab: PushTab = requested === "history" || (requested === "settings" && canManageSettings) ? requested : "compose";

  const total = await prisma.pushCampaign.count();
  const pageCount = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(Number(sp.page)) || 1));

  const [history, subscriberCount, totals, settings] = await Promise.all([
    getCampaignHistory(page, HISTORY_PAGE_SIZE),
    prisma.pushSubscription.count(),
    prisma.pushCampaign.aggregate({ _sum: { sent: true, failed: true } }),
    getPushSettings(),
  ]);

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Push Notification Manager"
      pageSubtitle="Compose, send and track browser push notifications"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <PushManager2Body
        tab={tab}
        canManageSettings={canManageSettings}
        appName={process.env.NEXT_PUBLIC_APP_NAME || "EduMint24"}
        siteUrl={process.env.NEXT_PUBLIC_SITE_URL || ""}
        stats={{
          subscribers: subscriberCount,
          campaigns: total,
          sent: totals._sum.sent ?? 0,
          failed: totals._sum.failed ?? 0,
        }}
        history={{ rows: history.rows, total: history.total, page, pageCount, pageSize: HISTORY_PAGE_SIZE }}
        settings={{
          configured: settings.configured,
          // The private key never leaves the server — only whether one is saved.
          ...(canManageSettings
            ? { publicKey: settings.publicKey, subject: settings.subject, hasPrivateKey: !!settings.privateKey }
            : { publicKey: "", subject: "", hasPrivateKey: false }),
        }}
      />
    </AdminShell>
  );
}
