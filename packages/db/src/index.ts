import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

type GlobalWithPrisma = typeof globalThis & { __tdcPrisma?: PrismaClient };

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({
    connectionString,
    // Serverless functions each hold a small pool; the worker can afford more.
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter });
}

/** Process-wide client. Reused across hot reloads in development. */
export function getPrisma(): PrismaClient {
  const g = globalThis as GlobalWithPrisma;
  if (!g.__tdcPrisma) {
    g.__tdcPrisma = createPrismaClient();
  }
  return g.__tdcPrisma;
}

export async function disconnectPrisma(): Promise<void> {
  const g = globalThis as GlobalWithPrisma;
  if (g.__tdcPrisma) {
    await g.__tdcPrisma.$disconnect();
    g.__tdcPrisma = undefined;
  }
}
