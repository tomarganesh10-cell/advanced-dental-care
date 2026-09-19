import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env, isProduction } from "./env";

/**
 * Prisma client singleton.
 *
 * Next.js dev mode re-evaluates modules on every hot reload, which would open a
 * new connection pool each time; the global cache prevents that.
 */

const createClient = (): PrismaClient =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: isProduction ? ["error", "warn"] : ["error", "warn"],
  });

type GlobalWithPrisma = typeof globalThis & { __adccPrisma?: PrismaClient };

const globalForPrisma = globalThis as GlobalWithPrisma;

export const prisma: PrismaClient = globalForPrisma.__adccPrisma ?? createClient();

if (!isProduction) {
  globalForPrisma.__adccPrisma = prisma;
}

export type { Prisma } from "@/generated/prisma/client";
export * from "@/generated/prisma/enums";
