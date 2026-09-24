import webpush from "web-push";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPushSettings } from "@/lib/push-settings";

export interface ComposeInput {
  title: string;
  body: string;
  url: string;
  image: string | null;
  postId: number | null;
}

export class PushSendError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Mirrors admin_push.php's post picker: published posts, newest first,
 *  optionally filtered by title (the modal's search box). */
export async function searchPublishedPosts(query: string, limit = 50) {
  const posts = await prisma.post.findMany({
    where: { status: "published", ...(query ? { title: { contains: query } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, slug: true, featuredImage: { select: { filePath: true } } },
  });
  return (posts as { id: number; title: string; slug: string; featuredImage: { filePath: string } | null }[]).map((p) => ({
    id: p.id, title: p.title, slug: p.slug, image: p.featuredImage?.filePath ?? null,
  }));
}

/** Queues a campaign for every current subscriber — mirrors send-push.php's
 *  transaction (INSERT campaign, then INSERT one push_queue row per
 *  subscription). Actual sending happens in processPushQueue(), called
 *  right after this returns (fire-and-forget) and optionally again by an
 *  external cron hitting /api/cron/push-queue2 for resilience on large
 *  subscriber lists — the same two-step design the PHP version used. */
export async function queueCampaign(input: ComposeInput): Promise<{ campaignId: number; totalSubscribers: number }> {
  if (!input.title.trim() || !input.url.trim()) throw new PushSendError("Title and Target URL are required.");

  const settings = await getPushSettings();
  if (!settings.configured) throw new PushSendError("Push notifications aren't configured yet — set your VAPID keys in the Settings tab first.");

  const totalSubscribers = await prisma.pushSubscription.count();
  if (totalSubscribers === 0) throw new PushSendError("There are no subscribers to send to yet.", 409);

  const campaign = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const c = await tx.pushCampaign.create({
      data: {
        postId: input.postId, title: input.title.trim(), body: input.body.trim(), url: input.url.trim(),
        image: input.image, status: "pending", totalSubscribers,
      },
    });
    const subs = await tx.pushSubscription.findMany({ select: { id: true } });
    if (subs.length) {
      await tx.pushQueue.createMany({ data: subs.map((s: { id: number }) => ({ campaignId: c.id, subscriptionId: s.id, status: "pending" })) });
    }
    return c;
  });

  return { campaignId: campaign.id, totalSubscribers };
}

/**
 * Sends one batch of pending queue items for the oldest pending/processing
 * campaign — mirrors cron-process-push-queue.php exactly: 410/404 means the
 * browser unsubscribed (delete the subscription + queue row), other errors
 * increment an attempt counter up to 3 tries before giving up, and the
 * campaign is marked "completed" once its queue is empty. Safe to call
 * repeatedly (e.g. every few seconds) — it's a no-op when nothing is pending.
 */
export async function processPushQueue(batchSize = 300): Promise<{ processed: number; campaignId: number | null }> {
  const settings = await getPushSettings();
  if (!settings.configured) return { processed: 0, campaignId: null };
  webpush.setVapidDetails(settings.subject, settings.publicKey, settings.privateKey);

  const campaign = await prisma.pushCampaign.findFirst({
    where: { status: { in: ["pending", "processing"] } },
    orderBy: { createdAt: "asc" },
  });
  if (!campaign) return { processed: 0, campaignId: null };

  if (campaign.status === "pending") {
    await prisma.pushCampaign.update({ where: { id: campaign.id }, data: { status: "processing" } });
  }

  const rows = await prisma.pushQueue.findMany({
    where: { campaignId: campaign.id, status: "pending" },
    take: batchSize,
  });
  const subIds = rows.map((r: { subscriptionId: number }) => r.subscriptionId);
  const subs = await prisma.pushSubscription.findMany({ where: { id: { in: subIds } } });
  const subById = new Map((subs as { id: number; endpoint: string; p256dh: string; auth: string }[]).map((s) => [s.id, s]));

  if (rows.length === 0) {
    const remaining = await prisma.pushQueue.count({ where: { campaignId: campaign.id } });
    if (remaining === 0) await prisma.pushCampaign.update({ where: { id: campaign.id }, data: { status: "completed" } });
    return { processed: 0, campaignId: campaign.id };
  }

  const payload = JSON.stringify({ title: campaign.title, body: campaign.body, image: campaign.image, url: campaign.url });
  const toDeleteQueue: number[] = [];
  const toDeleteSubs: number[] = [];
  let batchSent = 0, batchFailed = 0;
  const maxAttempts = 3;

  for (const row of rows as { id: number; subscriptionId: number; attempts: number | null }[]) {
    const sub = subById.get(row.subscriptionId);
    if (!sub) { toDeleteQueue.push(row.id); batchFailed++; continue; }
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      toDeleteQueue.push(row.id);
      batchSent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        toDeleteSubs.push(row.subscriptionId);
        toDeleteQueue.push(row.id);
        batchFailed++;
      } else {
        const attempts = (row.attempts ?? 0) + 1;
        const message = err instanceof Error ? err.message : "Unknown error";
        if (attempts >= maxAttempts) {
          toDeleteQueue.push(row.id);
          batchFailed++;
        } else {
          await prisma.pushQueue.update({ where: { id: row.id }, data: { attempts, lastError: message } });
        }
      }
    }
  }

  if (toDeleteQueue.length) await prisma.pushQueue.deleteMany({ where: { id: { in: toDeleteQueue } } });
  if (toDeleteSubs.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: toDeleteSubs } } });

  await prisma.pushCampaign.update({
    where: { id: campaign.id },
    data: { sent: { increment: batchSent }, failed: { increment: batchFailed } },
  });

  const remaining = await prisma.pushQueue.count({ where: { campaignId: campaign.id } });
  if (remaining === 0) await prisma.pushCampaign.update({ where: { id: campaign.id }, data: { status: "completed" } });

  return { processed: batchSent + batchFailed, campaignId: campaign.id };
}

/** Keeps calling processPushQueue until nothing is left to send, with a cap
 *  so a single request can't run forever — the rest is picked up by the
 *  next /api/cron/push-queue2 tick or the next send. */
export async function processPushQueueUntilDone(maxRounds = 20): Promise<void> {
  for (let i = 0; i < maxRounds; i++) {
    const { processed } = await processPushQueue();
    if (processed === 0) break;
  }
}

export interface CampaignHistoryRow {
  id: number;
  title: string;
  body: string;
  image: string | null;
  url: string | null;
  status: string;
  totalSubscribers: number;
  sent: number;
  failed: number;
  createdAt: string;
  post: { title: string; slug: string } | null;
}

export async function getCampaignHistory(page: number, limit = 10): Promise<{ rows: CampaignHistoryRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.pushCampaign.findMany({
      orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
      include: { post: { select: { title: true, slug: true } } },
    }),
    prisma.pushCampaign.count(),
  ]);
  return {
    total,
    rows: (rows as {
      id: number; title: string; body: string; image: string | null; url: string | null; status: string;
      totalSubscribers: number | null; sent: number | null; failed: number | null; createdAt: Date;
      post: { title: string; slug: string } | null;
    }[]).map((c) => ({
      id: c.id, title: c.title, body: c.body, image: c.image, url: c.url, status: c.status,
      totalSubscribers: c.totalSubscribers ?? 0, sent: c.sent ?? 0, failed: c.failed ?? 0,
      createdAt: c.createdAt.toISOString(), post: c.post,
    })),
  };
}

export async function deleteCampaign(id: number): Promise<void> {
  await prisma.pushCampaign.delete({ where: { id } }); // push_queue rows cascade via onDelete: Cascade
}
