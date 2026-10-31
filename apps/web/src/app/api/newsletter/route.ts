import { z } from "zod";
import { getPrisma } from "@tdc/db";
import { getEnv } from "@tdc/core/env";
import { createMailer } from "@tdc/core/email/mailer";
import { subscribe } from "@tdc/core/newsletter/service";
import { rateLimit } from "@tdc/core/security/ratelimit";
import { clientIpHash, isSameOrigin } from "@/lib/request";

const Body = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  consent: z.literal(true),
  website: z.string().max(0).optional().nullable(),
});

const NEUTRAL = "Check your inbox and confirm your address to start receiving the evening edition.";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Cross-site request rejected." }, { status: 403 });
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === "consent");
    return Response.json({ error: consentMissing ? "Tick the box to agree to receive the email." : "Enter a valid email address." }, { status: 400 });
  }
  // Honeypot filled in: pretend success without doing anything.
  if (parsed.data.website) return Response.json({ message: NEUTRAL });

  const prisma = getPrisma();
  const ip = (await clientIpHash()) ?? "unknown";
  const [byIp, byEmail] = await Promise.all([rateLimit(prisma, `nl-ip:${ip}`, 5, 3600), rateLimit(prisma, `nl-email:${parsed.data.email}`, 3, 86400)]);
  if (!byIp.allowed || !byEmail.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const env = getEnv();
  await subscribe(prisma, createMailer(env), { email: parsed.data.email, source: "website" });
  // Same response whether the address was new, pending or already confirmed.
  return Response.json({ message: NEUTRAL });
}
