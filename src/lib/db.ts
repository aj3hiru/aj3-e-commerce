import { PrismaClient } from "@prisma/client";
import { invalidateModel } from "./cache";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const WRITES = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);

function makeClient() {
  const client = new PrismaClient();
  // Any write drops the cached site data built from that table (lib/cache.ts).
  client.$use(async (params, next) => {
    const result = await next(params);
    if (WRITES.has(params.action)) invalidateModel(params.model);
    return result;
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? makeClient();

globalForPrisma.prisma = prisma;
