import type { PrismaClient } from "@tdc/db";
import { sha256 } from "./util/crypto";

/**
 * Enforces the retention periods stated in the privacy policy:
 * - unsubscribed addresses are anonymised 30 days after unsubscribing;
 * - contact messages are deleted after 12 months.
 */
export async function enforceRetention(prisma: PrismaClient, now = new Date()): Promise<{ anonymised: number; messagesDeleted: number }> {
  const unsubCutoff = new Date(now.getTime() - 30 * 24 * 3_600_000);
  const stale = await prisma.newsletterSubscriber.findMany({
    where: { status: "UNSUBSCRIBED", unsubscribedAt: { lt: unsubCutoff }, NOT: { email: { endsWith: "@anonymised.invalid" } } },
    select: { id: true, email: true },
  });
  for (const s of stale) {
    await prisma.newsletterSubscriber.update({
      where: { id: s.id },
      data: { email: `${sha256(s.email).slice(0, 32)}@anonymised.invalid`, source: null, confirmTokenHash: null, confirmTokenExpires: null },
    });
  }
  const msgCutoff = new Date(now.getTime() - 365 * 24 * 3_600_000);
  const { count } = await prisma.contactMessage.deleteMany({ where: { createdAt: { lt: msgCutoff } } });
  return { anonymised: stale.length, messagesDeleted: count };
}
