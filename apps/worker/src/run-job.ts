/**
 * Operator CLI: enqueue a job for the running worker, e.g.
 *   npm run run-job -w @tdc/worker -- COLLECT 2026-11-01
 *   npm run run-job -w @tdc/worker -- PUBLISH 2026-11-01 --force
 */
import { disconnectPrisma, getPrisma, JobType } from "@tdc/db";
import { enqueueJob } from "@tdc/core/jobs/queue";
import { isValidDateString, istDateString } from "@tdc/core/time/ist";

const [type, date = istDateString(), ...flags] = process.argv.slice(2);
if (!type || !(type in JobType)) {
  console.error(`Usage: run-job <${Object.keys(JobType).join("|")}> [YYYY-MM-DD] [--force]`);
  process.exit(1);
}
if (!isValidDateString(date)) {
  console.error(`Invalid date ${date}`);
  process.exit(1);
}
const { job } = await enqueueJob(getPrisma(), { type: type as JobType, editionDate: date, trigger: "MANUAL", payload: { force: flags.includes("--force") } });
console.log(`Queued ${job.type} for ${date}: ${job.id}`);
await disconnectPrisma();
