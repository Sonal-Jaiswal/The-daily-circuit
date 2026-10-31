import type { Prisma, PrismaClient } from "@tdc/db";

export async function audit(
  prisma: PrismaClient,
  entry: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    ipHash?: string | null;
  },
): Promise<void> {
  const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));
  await prisma.auditLog.create({
    data: {
      actorType: entry.actorId ? "USER" : "SYSTEM",
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: json(entry.before),
      after: json(entry.after),
      ipHash: entry.ipHash ?? null,
    },
  });
}
