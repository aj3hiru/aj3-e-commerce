/**
 * Runs once when the Next.js server starts. Keeps the push queue moving
 * without an external cron: if the server restarted while a campaign was
 * half-sent, the single queue worker picks it up again within ~30s.
 *
 * The import must sit directly inside the NEXT_RUNTIME === "nodejs" check:
 * Next also compiles this file for the edge runtime, and only this exact
 * pattern lets the bundler drop web-push (which needs Node's http/https) there.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { kickPushQueueIfWaiting } = await import("@/lib/push-manager2");
    setTimeout(() => void kickPushQueueIfWaiting(), 10_000);
    setInterval(() => void kickPushQueueIfWaiting(), 30_000).unref();
  }
}
