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
 *  transaction (INSERT campaign, then one push_queue row per subscription).
 *  Nothing is sent here: the single queue worker (kickPushQueue) picks the
 *  campaign up and sends it after every campaign queued before it. */
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
    // Chunked so a large subscriber list never becomes one enormous INSERT.
    for (let i = 0; i < subs.length; i += 1000) {
      await tx.pushQueue.createMany({
        data: subs.slice(i, i + 1000).map((s: { id: number }) => ({ campaignId: c.id, subscriptionId: s.id, status: "pending" })),
      });
    }
    // The count can move between the COUNT and the SELECT; store what was actually queued.
    if (subs.length !== totalSubscribers) await tx.pushCampaign.update({ where: { id: c.id }, data: { totalSubscribers: subs.length } });
    return c;
  }, { timeout: 60_000 });

  return { campaignId: campaign.id, totalSubscribers };
}

const BATCH_SIZE = 300; // same as cron-process-push-queue.php
const MAX_ATTEMPTS = 3;
const SEND_CONCURRENCY = 10; // parallel requests to push services within one batch
const CHUNK_SIZE = 20; // progress is saved roughly every 20 finished sends
const SEND_TIMEOUT_MS = 15_000; // a hung push service must not stall the queue
const LOCK_KEY = "push_queue_lock";
const LOCK_TTL_MS = 60_000; // renewed on every progress save

/**
 * Sends one batch (up to 300) for the OLDEST pending/processing campaign —
 * mirrors cron-process-push-queue.php: 410/404 means the browser unsubscribed
 * (delete the subscription + queue row), other errors are retried up to 3
 * times, and the campaign is marked "completed" once its queue is empty.
 * Campaigns are therefore sent strictly one after another, oldest first.
 *
 * Only the queue worker below should call this — it guarantees a single
 * caller at a time, so a batch is never sent twice.
 */
export async function processPushQueue(
  batchSize = BATCH_SIZE,
  heartbeat: () => Promise<boolean> = async () => true,
): Promise<{ processed: number; campaignId: number | null }> {
  const settings = await getPushSettings();
  if (!settings.configured) return { processed: 0, campaignId: null };
  webpush.setVapidDetails(settings.subject, settings.publicKey, settings.privateKey);

  const campaign = await prisma.pushCampaign.findFirst({
    where: { status: { in: ["pending", "processing"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!campaign) return { processed: 0, campaignId: null };

  if (campaign.status === "pending") {
    await prisma.pushCampaign.updateMany({ where: { id: campaign.id }, data: { status: "processing" } });
  }

  const rows = (await prisma.pushQueue.findMany({
    where: { campaignId: campaign.id, status: "pending" },
    orderBy: { id: "asc" },
    take: batchSize,
  })) as { id: number; subscriptionId: number; attempts: number | null }[];

  if (rows.length === 0) {
    // updateMany, not update: the campaign may have been deleted mid-send.
    await prisma.pushCampaign.updateMany({ where: { id: campaign.id }, data: { status: "completed" } });
    return { processed: 0, campaignId: campaign.id };
  }

  const subs = (await prisma.pushSubscription.findMany({
    where: { id: { in: rows.map((r) => r.subscriptionId) } },
  })) as { id: number; endpoint: string; p256dh: string; auth: string }[];
  const subById = new Map(subs.map((s) => [s.id, s]));

  const payload = JSON.stringify({ title: campaign.title, body: campaign.body, image: campaign.image, url: campaign.url });
  let toDeleteQueue: number[] = [];
  let toDeleteSubs: number[] = [];
  let retries: { id: number; attempts: number; lastError: string }[] = [];
  let chunkSent = 0, chunkFailed = 0;

  async function sendOne(row: (typeof rows)[number]) {
    const sub = subById.get(row.subscriptionId);
    if (!sub) { toDeleteQueue.push(row.id); chunkFailed++; return; }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 24 * 60 * 60, timeout: SEND_TIMEOUT_MS }
      );
      toDeleteQueue.push(row.id);
      chunkSent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        toDeleteSubs.push(row.subscriptionId);
        toDeleteQueue.push(row.id);
        chunkFailed++;
        return;
      }
      const attempts = (row.attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        toDeleteQueue.push(row.id);
        chunkFailed++;
      } else {
        retries.push({ id: row.id, attempts, lastError: (err instanceof Error ? err.message : "Unknown error").slice(0, 1000) });
      }
    }
  }

  /** Saves finished sends as they pile up (every ~20), so a crash or restart
   *  mid-batch re-sends only what was in flight or not yet saved — never the
   *  whole batch. Saves run one after another; sending never waits on them
   *  except when the batch ends. */
  let saving: Promise<void> = Promise.resolve();
  let stop = false;
  function save(): Promise<void> {
    // Take a snapshot synchronously so sends finishing meanwhile go to the next save.
    const snap = { q: toDeleteQueue, subs: toDeleteSubs, retries, sent: chunkSent, failed: chunkFailed };
    toDeleteQueue = []; toDeleteSubs = []; retries = []; chunkSent = 0; chunkFailed = 0;
    saving = saving.then(async () => {
      // One transaction: removing the finished queue rows and counting them
      // happen together, so a crash can never leave the counters short.
      await prisma.$transaction([
        ...snap.retries.map((r) =>
          prisma.pushQueue.updateMany({ where: { id: r.id }, data: { attempts: r.attempts, lastError: r.lastError } })),
        prisma.pushQueue.deleteMany({ where: { id: { in: snap.q } } }),
        prisma.pushSubscription.deleteMany({ where: { id: { in: snap.subs } } }),
        prisma.pushCampaign.updateMany({
          where: { id: campaign!.id },
          data: { sent: { increment: snap.sent }, failed: { increment: snap.failed } },
        }),
      ]);
      if (!(await heartbeat())) stop = true; // lost the queue lease — the new owner carries on
    }).catch((e) => {
      // Never let a background save reject unhandled (that would crash Node).
      // Stop this batch; the error is re-thrown below so the worker backs off,
      // and unsaved rows simply stay in the queue to be sent again.
      saveError ??= e;
      stop = true;
    });
    return saving;
  }
  let saveError: unknown = null;

  let next = 0;
  let processed = 0;
  // A small fixed pool: fast enough, but never hundreds of open sockets at once.
  await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, rows.length) }, async () => {
    while (next < rows.length && !stop) {
      await sendOne(rows[next++]);
      processed++;
      if (toDeleteQueue.length + retries.length >= CHUNK_SIZE) void save();
    }
  }));
  await save(); // whatever is left, and wait for every earlier save to land
  if (saveError) throw saveError;

  const remaining = await prisma.pushQueue.count({ where: { campaignId: campaign.id } });
  if (remaining === 0) await prisma.pushCampaign.updateMany({ where: { id: campaign.id }, data: { status: "completed" } });

  return { processed, campaignId: campaign.id };
}

/* ───────────────────────── the single queue worker ───────────────────────── */

type WorkerState = { running: boolean; again: boolean; owner: string };
const g = globalThis as unknown as { __pushWorker?: WorkerState };
const worker: WorkerState = (g.__pushWorker ??= { running: false, again: false, owner: `${process.pid}-${Math.random().toString(36).slice(2, 10)}` });

const lockValue = (expiresAt: number) => `${String(expiresAt).padStart(15, "0")}:${worker.owner}`;

/** A lease row in app_config, so even two server processes can never run the
 *  queue at the same time. The value starts with a zero-padded expiry time, so
 *  "expired" is a plain string comparison done atomically by the UPDATE. */
async function acquireLock(): Promise<boolean> {
  const now = Date.now();
  try {
    await prisma.appConfig.upsert({ where: { key: LOCK_KEY }, create: { key: LOCK_KEY, value: "" }, update: {} });
  } catch { /* two processes created it at once — it exists either way */ }
  const res = await prisma.appConfig.updateMany({
    where: { key: LOCK_KEY, OR: [{ value: "" }, { value: { lt: lockValue(now) } }, { value: { endsWith: `:${worker.owner}` } }] },
    data: { value: lockValue(now + LOCK_TTL_MS) },
  });
  return res.count === 1;
}

async function renewLock(): Promise<boolean> {
  const res = await prisma.appConfig.updateMany({
    where: { key: LOCK_KEY, value: { endsWith: `:${worker.owner}` } },
    data: { value: lockValue(Date.now() + LOCK_TTL_MS) },
  });
  return res.count === 1;
}

async function releaseLock(): Promise<void> {
  await prisma.appConfig.updateMany({ where: { key: LOCK_KEY, value: { endsWith: `:${worker.owner}` } }, data: { value: "" } }).catch(() => {});
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const debug = (...a: unknown[]) => { if (process.env.PUSH_QUEUE_DEBUG) console.log(`[push-queue ${worker.owner}]`, ...a); };

async function runWorker(): Promise<void> {
  if (!(await acquireLock())) { debug("lock busy"); return; } // another process is already sending
  debug("lock acquired");
  let errors = 0;
  try {
    for (;;) {
      worker.again = false;
      let processed = 0;
      let campaignId: number | null = null;
      try {
        ({ processed, campaignId } = await processPushQueue(BATCH_SIZE, renewLock));
        errors = 0;
      } catch (e) {
        // A DB blip or bad row must never kill the process — back off and retry,
        // and give up after a few in a row (the next kick resumes the queue).
        console.error("[push-queue] batch failed:", e instanceof Error ? e.message : e);
        if (++errors >= 5) { debug("stop: 5 errors in a row"); break; }
        await sleep(5_000 * errors);
        continue;
      }
      if (campaignId === null) { debug("stop: nothing to send"); break; } // nothing to send, or VAPID keys missing
      if (processed === 0 && !worker.again) {
        // Nothing sent this round: either the queue is empty, or the oldest
        // campaign just got marked completed and the next one is waiting.
        const waiting = await prisma.pushCampaign.count({ where: { status: { in: ["pending", "processing"] } } });
        if (waiting === 0) { debug("stop: queue empty"); break; }
      }
      if (!(await renewLock())) { debug("stop: lease lost"); break; } // lease lost — someone else owns the queue now
    }
  } finally {
    await releaseLock();
  }
}

/**
 * Makes sure the queue is being worked on. Safe to call as often as you like
 * (every send, a timer, the cron route): at most ONE worker runs, campaigns go
 * out strictly one after another, and a kick that arrives while the worker is
 * busy just makes it take another look before stopping. Never throws.
 */
export function kickPushQueue(): void {
  if (worker.running) { worker.again = true; return; }
  worker.running = true;
  void (async () => {
    try {
      do {
        worker.again = false;
        await runWorker();
      } while (worker.again);
    } catch (e) {
      console.error("[push-queue] worker stopped:", e instanceof Error ? e.message : e);
    } finally {
      worker.running = false;
    }
  })();
}

export function isPushWorkerRunning(): boolean {
  return worker.running;
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

/** Timer-friendly kick: one cheap COUNT, and the worker only starts when a
 *  campaign is actually waiting (e.g. left half-sent by a restart). */
export async function kickPushQueueIfWaiting(): Promise<void> {
  if (worker.running) return;
  try {
    const waiting = await prisma.pushCampaign.count({ where: { status: { in: ["pending", "processing"] } } });
    if (waiting > 0) kickPushQueue();
  } catch {
    /* DB unavailable — try again on the next tick */
  }
}
