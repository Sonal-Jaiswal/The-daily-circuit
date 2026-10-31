import { connection } from "next/server";
import { getPrisma } from "@tdc/db";

/** Uptime/health probe: database reachability, last job activity and configuration flags (no secrets). */
export async function GET() {
  await connection();
  const started = Date.now();
  let database: "ok" | "unreachable" = "ok";
  let lastJob: { type: string; status: string; finishedAt: Date | null } | null = null;
  try {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    lastJob = await prisma.jobExecution.findFirst({ where: { finishedAt: { not: null } }, orderBy: { finishedAt: "desc" }, select: { type: true, status: true, finishedAt: true } });
  } catch {
    database = "unreachable";
  }
  const body = {
    status: database === "ok" ? "ok" : "degraded",
    database,
    latencyMs: Date.now() - started,
    lastJob,
    config: {
      claude: Boolean(process.env.ANTHROPIC_API_KEY),
      email: process.env.EMAIL_TRANSPORT ?? "log",
      marketData: process.env.MARKET_DATA_PROVIDER ?? "none",
      analytics: Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
    },
    time: new Date().toISOString(),
  };
  return Response.json(body, { status: database === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
