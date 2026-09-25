import { PrismaClient } from "@prisma/client";
import { invalidateModel } from "./cache";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const WRITES = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);

/** Temporary clashes between two writers that simply succeed when tried again. */
function isTransient(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  if (code === "P2034" || code === "P2028" || code === "P2024") return true; // deadlock / write conflict, tx timed out, no free connection
  const msg = e instanceof Error ? e.message : "";
  return /deadlock|lock wait timeout|write conflict|Transaction already closed|Unable to start a transaction/i.test(msg);
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeClient() {
  const client = new PrismaClient({
    // Under a rush, wait in line for a connection / a row lock instead of giving up after 2–5 s.
    transactionOptions: { maxWait: 15_000, timeout: 20_000 },
  });
  // Any write drops the cached site data built from that table (lib/cache.ts).
  client.$use(async (params, next) => {
    const result = await next(params);
    if (WRITES.has(params.action)) invalidateModel(params.model);
    return result;
  });
  // Every transaction is retried (up to 3 times, short random pause) when MySQL
  // reports a deadlock / lock timeout. Business errors (out of stock…) are never retried.
  const original = client.$transaction.bind(client) as (...a: unknown[]) => Promise<unknown>;
  (client as unknown as { $transaction: (...a: unknown[]) => Promise<unknown> }).$transaction = async (...args: unknown[]) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await original(...args);
      } catch (e) {
        if (attempt >= 4 || !isTransient(e)) throw e;
        await pause(40 * attempt + Math.random() * 120);
      }
    }
  };
  return client;
}

export const prisma = globalForPrisma.prisma ?? makeClient();

globalForPrisma.prisma = prisma;
