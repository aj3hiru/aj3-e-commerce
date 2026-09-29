/**
 * Browser helper for saves: retries when the server can't be reached for a
 * moment (a restart after an update, a network blip) — about 20 seconds in all.
 * Every attempt carries the same Idempotency-Key, so the server does the change
 * only once even if an earlier attempt actually got through (see lib/api-errors.ts).
 */
export async function fetchWithRetry(url: string, init: RequestInit, opts: { tries?: number; onRetry?: (n: number) => void } = {}): Promise<Response> {
  const tries = opts.tries ?? 6;
  const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`;
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", key.replace(/[^A-Za-z0-9_-]/g, ""));
  let last: unknown = null;
  for (let i = 0; i < tries; i++) {
    if (i > 0) {
      opts.onRetry?.(i);
      await new Promise((r) => setTimeout(r, Math.min(6000, 1000 * 2 ** (i - 1))));
    }
    try {
      const res = await fetch(url, { ...init, headers });
      // 502/503/504 = the server is restarting or busy; 409 retry = the first attempt is still running.
      if ([502, 503, 504].includes(res.status)) { last = res; continue; }
      if (res.status === 409 && res.headers.get("content-type")?.includes("json")) {
        const body = await res.clone().json().catch(() => null);
        if (body?.retry) { last = res; continue; }
      }
      return res;
    } catch (e) {
      last = e;
    }
  }
  if (last instanceof Response) return last;
  throw last ?? new Error("network");
}
