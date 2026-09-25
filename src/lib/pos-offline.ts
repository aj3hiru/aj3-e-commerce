/**
 * Offline billing for the POS.
 *
 * Every bill gets its own id on the till (client_ref) before it is sent. If the
 * internet is down — or the reply never comes back — the bill is kept in this
 * browser and uploaded automatically when the connection returns. The server
 * saves each client_ref only once, so a bill can be re-sent safely any number
 * of times: it is never lost and never doubled.
 */

export interface QueuedBill {
  ref: string;
  soldAt: string;
  /** The exact checkout request body. */
  body: Record<string, unknown>;
  /** What the receipt showed, for the pending list. */
  summary: { customer: string; total: number; items: number };
  attempts: number;
  lastError: string | null;
  /** Rejected by the server (not a connection problem) — needs a person to look at it. */
  failed: boolean;
}

const KEY = "pos_offline_queue_v1";
const LOCK = "pos_offline_sync_lock";
export const QUEUE_EVENT = "pos:offline-queue";

export function newBillRef(): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `pos-${Date.now().toString(36)}-${rnd.slice(0, 16)}`;
}

export function readQueue(): QueuedBill[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? (list as QueuedBill[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(list: QueuedBill[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked — nothing more we can do here */
  }
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function enqueueBill(bill: Omit<QueuedBill, "attempts" | "lastError" | "failed">) {
  const list = readQueue().filter((b) => b.ref !== bill.ref);
  list.push({ ...bill, attempts: 0, lastError: null, failed: false });
  writeQueue(list);
}

export function removeBill(ref: string) {
  writeQueue(readQueue().filter((b) => b.ref !== ref));
}

export function retryBill(ref: string) {
  writeQueue(readQueue().map((b) => (b.ref === ref ? { ...b, failed: false, lastError: null } : b)));
}

/** POST with a time limit, so a bad connection never leaves the till waiting. */
export async function postJson(url: string, body: unknown, timeoutMs = 15_000): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal, credentials: "same-origin" });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Uploads waiting bills one by one (oldest first). Stops at the first
 * connection problem and tries again later. Only one tab uploads at a time.
 */
export async function syncQueue(): Promise<{ sent: number; left: number; loginNeeded: boolean }> {
  const now = Date.now();
  try {
    const lock = Number(localStorage.getItem(LOCK) ?? 0);
    if (now - lock < 60_000) return { sent: 0, left: readQueue().length, loginNeeded: false };
    localStorage.setItem(LOCK, String(now));
  } catch { /* no storage — just go ahead */ }

  let sent = 0, loginNeeded = false;
  try {
    for (const bill of readQueue()) {
      if (bill.failed) continue;
      let result: Awaited<ReturnType<typeof postJson>>;
      try {
        result = await postJson("/api/ecommerce/billing/checkout", bill.body, 20_000);
      } catch {
        break; // still offline / timed out — keep everything for next time
      }
      const list = readQueue();
      const i = list.findIndex((b) => b.ref === bill.ref);
      if (result.data?.success) {
        if (i >= 0) list.splice(i, 1);
        writeQueue(list);
        sent++;
        continue;
      }
      if (result.status === 401 || result.status === 403) { loginNeeded = true; break; } // session ended — log in again, bills stay
      if (result.status >= 500 || result.status === 0 || !result.data) {
        if (i >= 0) { list[i] = { ...list[i], attempts: list[i].attempts + 1, lastError: "Server busy — will retry" }; writeQueue(list); }
        break;
      }
      // A real "no" from the server (e.g. every product in it was deleted): keep it, but ask a person.
      if (i >= 0) { list[i] = { ...list[i], attempts: list[i].attempts + 1, lastError: String(result.data.message ?? "Rejected"), failed: true }; writeQueue(list); }
    }
  } finally {
    try { localStorage.removeItem(LOCK); } catch { /* ignore */ }
  }
  return { sent, left: readQueue().length, loginNeeded };
}
