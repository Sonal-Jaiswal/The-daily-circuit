import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@tdc/db";
import { siteUrl } from "../env";
import { confirmSubscriptionEmail } from "../email/templates";
import type { Mailer } from "../email/mailer";
import { hmac, randomToken, safeEqual, sha256 } from "../util/crypto";

export const CONSENT_TEXT =
  "I agree to receive The Daily Circuit's evening edition by email. I can unsubscribe at any time using the link in every email.";

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return s;
}

/** Stateless, unforgeable unsubscribe token: "<subscriberId>.<hmac>". */
export function unsubscribeToken(subscriberId: string): string {
  return `${subscriberId}.${hmac(secret(), `unsubscribe:${subscriberId}`)}`;
}

export function unsubscribeUrl(subscriberId: string): string {
  return `${siteUrl()}/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken(subscriberId))}`;
}

export type SubscribeOutcome = "confirmation_sent" | "already_confirmed";

/**
 * Double opt-in. The response is the same whether or not the address exists, so the form
 * cannot be used to discover who subscribes.
 */
export async function subscribe(
  prisma: PrismaClient,
  mailer: Mailer,
  input: { email: string; source?: string; siteName?: string },
): Promise<SubscribeOutcome> {
  const email = EmailSchema.parse(input.email);
  const token = randomToken(32);
  const confirmTokenHash = sha256(token);
  const confirmTokenExpires = new Date(Date.now() + 48 * 3_600_000);
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  if (existing?.status === "CONFIRMED") return "already_confirmed";
  if (existing) {
    await prisma.newsletterSubscriber.update({
      where: { id: existing.id },
      data: { status: "PENDING", confirmTokenHash, confirmTokenExpires, consentText: CONSENT_TEXT, unsubscribedAt: null },
    });
  } else {
    const id = randomUUID();
    await prisma.newsletterSubscriber.create({
      data: { id, email, status: "PENDING", confirmTokenHash, confirmTokenExpires, unsubscribeTokenHash: sha256(unsubscribeToken(id)), consentText: CONSENT_TEXT, source: input.source ?? "website" },
    });
  }
  await mailer.send(confirmSubscriptionEmail({ to: email, confirmUrl: `${siteUrl()}/newsletter/confirm?token=${encodeURIComponent(token)}`, siteName: input.siteName ?? "The Daily Circuit" }));
  return "confirmation_sent";
}

export async function confirmSubscription(prisma: PrismaClient, token: string): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const sub = await prisma.newsletterSubscriber.findUnique({ where: { confirmTokenHash: sha256(token) } });
  if (!sub || !sub.confirmTokenExpires || sub.confirmTokenExpires < new Date()) return false;
  await prisma.newsletterSubscriber.update({
    where: { id: sub.id },
    data: { status: "CONFIRMED", confirmedAt: new Date(), confirmTokenHash: null, confirmTokenExpires: null },
  });
  return true;
}

export async function unsubscribe(prisma: PrismaClient, token: string): Promise<boolean> {
  const [id, mac] = token.split(".");
  if (!id || !mac || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  if (!safeEqual(mac, hmac(secret(), `unsubscribe:${id}`))) return false;
  const res = await prisma.newsletterSubscriber.updateMany({
    where: { id, status: { not: "UNSUBSCRIBED" } },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date(), confirmTokenHash: null },
  });
  if (res.count) return true;
  return (await prisma.newsletterSubscriber.count({ where: { id } })) === 1;
}
