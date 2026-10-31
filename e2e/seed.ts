/**
 * Seeds the disposable end-to-end database with fictional fixture content.
 * Runs only against a database whose name contains "e2e". Never point it at production.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { createPrismaClient, Prisma } from "@tdc/db";
import { hashPassword } from "../packages/core/src/auth/password";

const url = process.env.DATABASE_URL ?? "";
if (!/e2e/.test(new URL(url).pathname)) throw new Error("e2e seed refuses to run outside an *e2e* database");

const root = path.resolve(__dirname, "..");
execSync("npx prisma migrate reset --force", { cwd: path.join(root, "packages/db"), env: { ...process.env, DIRECT_DATABASE_URL: url, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "e2e test database reset" }, stdio: "pipe" });
execSync("npx tsx prisma/seed.ts", { cwd: path.join(root, "packages/db"), env: process.env, stdio: "pipe" });

const prisma = createPrismaClient(url);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const body = (topic: string) =>
  Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1} describes the fictional ${topic} in plain language for test readers, noting what was announced and what remains unconfirmed [S1].`).join("\n\n") +
  "\n\n### What was announced\n\n- The first point of the announcement [S1]\n- A second point, reported separately [S2]";

async function article(input: { slug: string; section: "AI" | "TECHNOLOGY" | "MARKETS"; headline: string; status: "PUBLISHED" | "DRAFT" | "NEEDS_REVIEW"; hours: number; tags: string[] }) {
  const category = await prisma.category.findUniqueOrThrow({ where: { section: input.section } });
  const author = await prisma.author.findUniqueOrThrow({ where: { slug: input.section === "MARKETS" ? "markets-desk" : "ai-desk" } });
  const a = await prisma.article.create({
    data: {
      idempotencyKey: `e2e:${input.slug}`,
      slug: input.slug,
      status: input.status,
      section: input.section,
      categoryId: category.id,
      authorId: author.id,
      headline: input.headline,
      excerpt: `${input.headline}. A fictional fixture used by automated end-to-end tests of the publication.`,
      introduction: `${input.headline}, according to the fictional announcement [S1].`,
      body: body(input.headline.toLowerCase()),
      context: "This fixture exists only in the test database [S1].",
      whyItMatters: "It lets the tests check the full article layout [S2].",
      keyFacts: [
        { fact: "This is a test fixture.", sourceIds: ["S1"] },
        { fact: "It has two sources.", sourceIds: ["S2"] },
      ] as Prisma.InputJsonValue,
      implications: "None; this is fixture content.",
      risks: "None; this is fixture content.",
      seoTitle: input.headline.slice(0, 60),
      seoDescription: `${input.headline}. A fictional fixture used by automated end-to-end tests of the publication layout.`,
      imageAlt: "Abstract circuit illustration",
      readingTimeMinutes: 3,
      disclaimerRequired: input.section === "MARKETS",
      publishedAt: input.status === "PUBLISHED" ? hoursAgo(input.hours) : null,
      validationReport: { blocking: [], review: input.status === "NEEDS_REVIEW" ? ["Possible investment advice"] : [], warnings: [], stats: {}, checkedAt: new Date().toISOString() },
      sources: {
        create: [
          { url: "https://example.com/fixture-source-one", title: "Fixture source one", publisherName: "Example Newsroom", citationId: "S1", isPrimary: true, sortOrder: 0, publishedAt: hoursAgo(input.hours + 2) },
          { url: "https://example.org/fixture-source-two", title: "Fixture source two", publisherName: "Example Wire", citationId: "S2", sortOrder: 1, publishedAt: hoursAgo(input.hours + 3) },
        ],
      },
    },
  });
  for (const name of input.tags) {
    const tag = await prisma.tag.upsert({ where: { slug: name.toLowerCase() }, create: { slug: name.toLowerCase(), name }, update: {} });
    await prisma.articleTag.create({ data: { articleId: a.id, tagId: tag.id } });
  }
  return a;
}

async function main() {
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const edition = await prisma.dailyEdition.create({
  data: { editionDate: new Date(`${today}T00:00:00Z`), title: "Evening edition, test fixture", status: "PUBLISHED", aiCount: 2, marketCount: 1, scheduledFor: hoursAgo(1), publishedAt: hoursAgo(1) },
});
const items = [
  await article({ slug: "example-labs-releases-fixture-model", section: "AI", headline: "Example Labs releases a fixture language model for testing", status: "PUBLISHED", hours: 1, tags: ["Example Labs", "Models"] }),
  await article({ slug: "fixture-chipmaker-reports-results", section: "TECHNOLOGY", headline: "Fixture Chipmaker reports quarterly results in test data", status: "PUBLISHED", hours: 2, tags: ["Semiconductors", "Models"] }),
  await article({ slug: "fixture-regulator-issues-order", section: "MARKETS", headline: "Fixture Regulator issues an order against Example Energy", status: "PUBLISHED", hours: 3, tags: ["Regulation"] }),
];
await prisma.article.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { editionId: edition.id } });
await article({ slug: "unpublished-draft-fixture", section: "AI", headline: "Unpublished draft fixture that must never be public", status: "DRAFT", hours: 0, tags: [] });
await article({ slug: "fixture-awaiting-review", section: "MARKETS", headline: "Fixture article awaiting editorial review", status: "NEEDS_REVIEW", hours: 0, tags: [] });

await prisma.user.create({ data: { email: "admin@e2e.test", name: "E2E Admin", role: "ADMIN", passwordHash: await hashPassword("e2e-admin-password-123") } });
await prisma.user.create({ data: { email: "editor@e2e.test", name: "E2E Editor", role: "EDITOR", passwordHash: await hashPassword("e2e-editor-password-123") } });
await prisma.$disconnect();
console.log("e2e database seeded");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
