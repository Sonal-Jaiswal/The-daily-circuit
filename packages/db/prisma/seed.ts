import "dotenv/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createPrismaClient } from "../src/index";
import { authors, categories, defaultScoringWeights, defaultWatchlist, sources } from "./seed-data";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

/**
 * Idempotent: safe to run on every deploy. Existing rows keep admin edits
 * (e.g. a source an editor disabled stays disabled).
 */
async function main() {
  const prisma = createPrismaClient();
  try {
    for (const c of categories) {
      await prisma.category.upsert({
        where: { slug: c.slug },
        create: { ...c },
        update: {},
      });
    }
    for (const a of authors) {
      await prisma.author.upsert({ where: { slug: a.slug }, create: { ...a }, update: {} });
    }
    for (const s of sources) {
      await prisma.newsSource.upsert({
        where: { slug: s.slug },
        create: { ...s, type: "RSS", maxItemsPerFetch: s.maxItemsPerFetch ?? 50 },
        update: {},
      });
    }
    await prisma.siteSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        scoringWeights: defaultScoringWeights,
        marketWatchlist: defaultWatchlist,
      },
      update: {},
    });
    const counts = {
      categories: await prisma.category.count(),
      authors: await prisma.author.count(),
      sources: await prisma.newsSource.count(),
    };
    console.log("Seed complete", counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
