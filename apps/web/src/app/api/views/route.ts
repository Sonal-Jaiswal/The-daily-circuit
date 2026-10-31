import { z } from "zod";
import { getPrisma } from "@tdc/db";
import { recordView } from "@tdc/core/content/queries";
import { rateLimit } from "@tdc/core/security/ratelimit";
import { clientIpHash, isSameOrigin } from "@/lib/request";

const Body = z.object({ articleId: z.uuid() });

/** First-party, cookie-free view counting for "Most read". */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 204 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 204 });
  const prisma = getPrisma();
  const ip = (await clientIpHash()) ?? "unknown";
  const limit = await rateLimit(prisma, `view:${ip}:${parsed.data.articleId}`, 1, 3600);
  if (limit.allowed) {
    const exists = await prisma.article.count({ where: { id: parsed.data.articleId, status: "PUBLISHED" } });
    if (exists) await recordView(prisma, parsed.data.articleId);
  }
  return new Response(null, { status: 204 });
}
