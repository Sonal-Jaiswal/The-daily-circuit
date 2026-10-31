import type { PrismaClient } from "@tdc/db";
import { sha256 } from "../util/crypto";
import { slugify } from "../util/text";

/**
 * A slug that no other article uses. Slugs are permanent once published, so collisions get a
 * short deterministic suffix instead of replacing an existing URL.
 */
export async function uniqueSlug(prisma: Pick<PrismaClient, "article">, headline: string, seed: string, excludeArticleId?: string): Promise<string> {
  const base = slugify(headline, 80);
  const taken = async (slug: string) => {
    const hit = await prisma.article.findUnique({ where: { slug }, select: { id: true } });
    return hit !== null && hit.id !== excludeArticleId;
  };
  if (!(await taken(base))) return base;
  for (let i = 0; i < 20; i += 1) {
    const candidate = `${base.slice(0, 72)}-${sha256(`${seed}:${i}`).slice(0, 6)}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error(`Could not find a free slug for "${headline}"`);
}
