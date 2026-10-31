import http from "node:http";
import type { AddressInfo } from "node:net";
import { createPrismaClient, type PrismaClient } from "@tdc/db";
import { ScriptedGateway, type StructuredCall } from "../../src/ai/gateway";
import { LogMailer } from "../../src/email/mailer";
import { silentLogger } from "../../src/logger";
import type { PipelineContext } from "../../src/pipeline/context";
import { loadSettings } from "../../src/settings";
import { clearRobotsCache } from "../../src/collector/robots";

let prisma: PrismaClient | null = null;

export function db(): PrismaClient {
  if (!process.env.DATABASE_URL?.includes("test")) throw new Error("Integration tests must use a database whose name contains 'test'");
  prisma ??= createPrismaClient(process.env.DATABASE_URL);
  return prisma;
}

export async function closeDb() {
  await prisma?.$disconnect();
  prisma = null;
}

/** Empties every table, then inserts the reference rows the pipeline needs. */
export async function resetDatabase() {
  const p = db();
  const tables = await p.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await p.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  for (const [slug, name, section, desk] of [
    ["ai", "AI News", "AI", "AI"],
    ["technology", "Technology", "TECHNOLOGY", "AI"],
    ["markets", "Indian Markets", "MARKETS", "MARKETS"],
    ["ipo", "IPO", "IPO", "MARKETS"],
  ] as const) {
    await p.category.create({ data: { slug, name, section, desk, description: `${name} desk` } });
  }
  await p.author.create({ data: { slug: "ai-desk", name: "AI Desk", role: "Automated", bio: "Automated desk" } });
  await p.author.create({ data: { slug: "markets-desk", name: "Markets Desk", role: "Automated", bio: "Automated desk" } });
  await p.siteSettings.create({
    data: { id: "default", scoringWeights: { importance: 0.3, credibility: 0.25, freshness: 0.2, impact: 0.15, interest: 0.1 }, marketWatchlist: [], enableFactCheckPass: false },
  });
  clearRobotsCache();
}

export interface FixtureServer {
  url: string;
  routes: Map<string, { status?: number; type?: string; body: string }>;
  hits: string[];
  close(): Promise<void>;
}

/** Local HTTP server standing in for publishers' feeds and article pages. */
export async function startFixtureServer(): Promise<FixtureServer> {
  const routes = new Map<string, { status?: number; type?: string; body: string }>();
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url} ${req.headers["user-agent"]}`);
    const route = routes.get(new URL(req.url ?? "/", "http://fixture").pathname);
    if (!route) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(route.status ?? 200, { "content-type": route.type ?? "text/html; charset=utf-8" }).end(route.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, routes, hits, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

export async function makeContext(overrides: Partial<PipelineContext> & { respond?: (call: StructuredCall<unknown>) => unknown } = {}): Promise<PipelineContext & { mailer: LogMailer; llm: ScriptedGateway }> {
  const settings = await loadSettings(db());
  const llm = new ScriptedGateway(overrides.respond ?? (() => new Error("no scripted response")));
  return {
    prisma: db(),
    llm,
    mailer: new LogMailer(),
    log: silentLogger,
    settings,
    editionDate: "2026-11-01",
    jobId: null,
    now: () => new Date("2026-11-01T15:30:00Z"),
    models: { writer: "claude-sonnet-5-5", classifier: "claude-haiku-5-5" },
    marketProvider: null,
    revalidate: async () => undefined,
    alertRecipients: ["editor@test.example"],
    payload: {},
    ...overrides,
  } as PipelineContext & { mailer: LogMailer; llm: ScriptedGateway };
}

export function rssFeed(items: Array<{ title: string; link: string; pubDate?: string; description?: string }>): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title>${items
    .map((i) => `<item><title>${i.title}</title><link>${i.link}</link>${i.pubDate ? `<pubDate>${i.pubDate}</pubDate>` : ""}<description>${i.description ?? ""}</description></item>`)
    .join("")}</channel></rss>`;
}

export function articlePage(title: string, paragraphs: string[], publishedIso?: string): string {
  return `<html><head><title>${title}</title>${publishedIso ? `<meta property="article:published_time" content="${publishedIso}">` : ""}</head><body><article><h1>${title}</h1>${paragraphs.map((p) => `<p>${p}</p>`).join("")}</article></body></html>`;
}
