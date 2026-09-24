/**
 * Runs once when the Next.js server starts. Keeps the push queue moving
 * without an external cron: if the server restarted while a campaign was
 * half-sent, the single queue worker picks it up again within ~30s.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { kickPushQueueIfWaiting } = await import("@/lib/push-manager2");
  setTimeout(() => void kickPushQueueIfWaiting(), 10_000);
  setInterval(() => void kickPushQueueIfWaiting(), 30_000).unref();
}
