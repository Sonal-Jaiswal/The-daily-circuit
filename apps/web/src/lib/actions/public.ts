"use server";

import { z } from "zod";
import { getPrisma } from "@tdc/db";
import { adminAlertRecipients, getEnv } from "@tdc/core/env";
import { createMailer } from "@tdc/core/email/mailer";
import { confirmSubscription, unsubscribe } from "@tdc/core/newsletter/service";
import { rateLimit } from "@tdc/core/security/ratelimit";
import { clientIpHash } from "@/lib/request";

export interface FormState {
  ok: boolean;
  message: string;
}

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  topic: z.enum(["general", "correction", "grievance", "privacy", "advertising"]),
  message: z.string().trim().min(10, "Your message is too short").max(5000, "Keep your message under 5,000 characters"),
  website: z.string().max(0).optional(), // honeypot
});

export async function submitContact(_prev: FormState | null, formData: FormData): Promise<FormState> {
  const parsed = ContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const prisma = getPrisma();
  const limit = await rateLimit(prisma, `contact:${(await clientIpHash()) ?? "unknown"}`, 3, 3600);
  if (!limit.allowed) return { ok: false, message: "You have sent several messages recently. Try again in an hour." };
  const { name, email, topic, message } = parsed.data;
  await prisma.contactMessage.create({ data: { name, email, topic, message } });
  const env = getEnv();
  const recipients = adminAlertRecipients(env);
  if (recipients.length) {
    await createMailer(env)
      .send({ to: recipients, subject: `[Contact: ${topic}] ${name}`, text: `${name} <${email}>\nTopic: ${topic}\n\n${message}`, html: `<p><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt;<br>Topic: ${topic}</p><pre style="white-space:pre-wrap">${escapeHtml(message)}</pre>` })
      .catch(() => undefined);
  }
  return { ok: true, message: "Thanks. Your message has been received, and we reply to most messages within two working days." };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function confirmNewsletter(_prev: FormState | null, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const ok = await confirmSubscription(getPrisma(), token);
  return ok
    ? { ok: true, message: "You're subscribed. The next evening edition will arrive after 9:00 pm IST." }
    : { ok: false, message: "This confirmation link is invalid or has expired. Subscribe again to get a new link." };
}

export async function unsubscribeNewsletter(_prev: FormState | null, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const ok = await unsubscribe(getPrisma(), token);
  return ok ? { ok: true, message: "You've been unsubscribed and won't receive any more emails from us." } : { ok: false, message: "This unsubscribe link is invalid. Use the link in your most recent email." };
}
