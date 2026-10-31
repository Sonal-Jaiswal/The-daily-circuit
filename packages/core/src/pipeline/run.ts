import type { JobType } from "@tdc/db";
import { collectAll } from "../collector/collect";
import type { PipelineContext, StageResult } from "./context";
import { postPublishStage, prepareEditionStage, publishStage, validateStage } from "./stages/edition";
import { generateStage } from "./stages/generate";
import { marketSnapshotStage } from "./stages/market";
import { processStage } from "./stages/process";
import { rankStage } from "./stages/rank";

async function collectStage(ctx: PipelineContext): Promise<StageResult> {
  const sourceIds = Array.isArray(ctx.payload.sourceIds) ? (ctx.payload.sourceIds as string[]) : undefined;
  const stats = await collectAll(ctx.prisma, { editionDate: ctx.editionDate, publishTimeIst: ctx.settings.publishTimeIst, now: ctx.now(), log: ctx.log, sourceIds, fetchImpl: ctx.fetchImpl });
  const failures = stats.results.filter((r) => r.status === "error").map((r) => `${r.name}: ${r.error}`);
  return {
    status: stats.sourcesProcessed > 0 && stats.sourcesFailed === stats.sourcesProcessed ? "PARTIAL" : "SUCCEEDED",
    summary: { sourcesProcessed: stats.sourcesProcessed, sourcesFailed: stats.sourcesFailed, itemsSeen: stats.itemsSeen, candidatesCreated: stats.candidatesCreated, results: stats.results.map((r) => ({ ...r })) },
    problems: failures,
  };
}

const STAGES: Record<JobType, (ctx: PipelineContext) => Promise<StageResult>> = {
  COLLECT: collectStage,
  PROCESS: processStage,
  RANK: rankStage,
  GENERATE: generateStage,
  VALIDATE: validateStage,
  PREPARE_EDITION: prepareEditionStage,
  PUBLISH: publishStage,
  POST_PUBLISH: postPublishStage,
  MARKET_SNAPSHOT: marketSnapshotStage,
};

export function runStage(type: JobType, ctx: PipelineContext): Promise<StageResult> {
  return STAGES[type](ctx);
}

export const JOB_LABELS: Record<JobType, string> = {
  COLLECT: "Collect news",
  PROCESS: "Normalise, deduplicate and classify",
  RANK: "Rank candidates",
  GENERATE: "Research and write articles",
  VALIDATE: "Validate articles",
  PREPARE_EDITION: "Prepare daily edition",
  PUBLISH: "Publish approved articles",
  POST_PUBLISH: "Refresh sitemaps and send reports",
  MARKET_SNAPSHOT: "Market snapshot",
};
