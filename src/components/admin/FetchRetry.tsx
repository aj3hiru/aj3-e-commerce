"use client";

import { useEffect } from "react";

const RETRY_STATUS = new Set([502, 503, 504]);
const METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Every save on the admin pages survives a short server restart or network
 * blip: same-site /api changes are retried for about 20 seconds, each with one
 * Idempotency-Key so the server applies the change only once.
 */
export function FetchRetry() {
  useEffect(() => {
    const w = window as unknown as { __fetchRetry?: boolean };
    if (w.__fetchRetry) return;
    w.__fetchRetry = true;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const sameSite = url.startsWith("/api/") || url.startsWith(`${location.origin}/api/`);
      if (!sameSite || !METHODS.has(method) || input instanceof Request) return original(input, init);
      const headers = new Headers(init?.headers);
      if (!headers.has("Idempotency-Key")) headers.set("Idempotency-Key", crypto.randomUUID().replace(/-/g, ""));
      const opts = { ...init, headers };
      let last: unknown = null;
      for (let i = 0; i < 6; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, Math.min(6000, 1000 * 2 ** (i - 1))));
        try {
          const res = await original(input, opts);
          if (RETRY_STATUS.has(res.status)) { last = res; continue; }
          if (res.status === 409 && (await res.clone().json().catch(() => null))?.retry) { last = res; continue; }
          return res;
        } catch (e) {
          if ((e as { name?: string })?.name === "AbortError") throw e;
          last = e;
        }
      }
      if (last instanceof Response) return last;
      throw last;
    };
  }, []);
  return null;
}
