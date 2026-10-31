import type { Env } from "@tdc/core/env";
import type { Logger } from "@tdc/core/logger";

/** Asks the web app to refresh cached pages after publication. */
export function createRevalidator(env: Env, log: Logger) {
  const base = env.WEB_INTERNAL_URL ?? env.NEXT_PUBLIC_SITE_URL;
  return async (paths: string[]) => {
    if (!env.INTERNAL_JOB_SECRET) {
      log.warn("INTERNAL_JOB_SECRET not set; skipping cache revalidation");
      return;
    }
    const res = await fetch(`${base.replace(/\/+$/, "")}/api/internal/revalidate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.INTERNAL_JOB_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Revalidation returned ${res.status}`);
  };
}
