import { fetchText } from "../util/http";
import { HttpError } from "../util/retry";

/** Product token we match in robots.txt groups. */
export const ROBOTS_AGENT = "thedailycircuitbot";

interface Rule {
  allow: boolean;
  pattern: string;
}
interface Group {
  agents: string[];
  rules: Rule[];
}

export interface RobotsPolicy {
  isAllowed(pathWithQuery: string): boolean;
}

export const allowAll: RobotsPolicy = { isAllowed: () => true };
export const disallowAll: RobotsPolicy = { isAllowed: () => false };

/** RFC 9309 parser: most specific matching group, longest matching rule wins, Allow wins ties. */
export function parseRobots(body: string, agent = ROBOTS_AGENT): RobotsPolicy {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (!current) continue;
      if (key === "disallow" && value === "") continue; // empty disallow = allow everything
      current.rules.push({ allow: key === "allow", pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  const a = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((x) => x !== "*" && a.includes(x)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  if (!rules.length) return allowAll;
  return {
    isAllowed(path: string) {
      let best: Rule | null = null;
      let bestLen = -1;
      for (const rule of rules) {
        if (!matchPattern(rule.pattern, path)) continue;
        const len = rule.pattern.length;
        if (len > bestLen || (len === bestLen && rule.allow && best && !best.allow)) {
          best = rule;
          bestLen = len;
        }
      }
      return best ? best.allow : true;
    },
  };
}

function matchPattern(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path);
}

const cache = new Map<string, { policy: RobotsPolicy; expires: number }>();
const TTL_MS = 6 * 60 * 60 * 1000;

export async function getRobotsPolicy(url: string, fetchImpl?: typeof fetch): Promise<RobotsPolicy> {
  const origin = new URL(url).origin;
  const hit = cache.get(origin);
  if (hit && hit.expires > Date.now()) return hit.policy;
  let policy: RobotsPolicy;
  try {
    const res = await fetchText(`${origin}/robots.txt`, { timeoutMs: 10_000, maxBytes: 500_000, fetchImpl });
    policy = parseRobots(res.text);
  } catch (error) {
    // 4xx: no robots.txt -> allowed. 5xx / unreachable: assume disallowed (RFC 9309 §2.3.1.4).
    policy = error instanceof HttpError && error.status >= 400 && error.status < 500 ? allowAll : disallowAll;
  }
  cache.set(origin, { policy, expires: Date.now() + TTL_MS });
  return policy;
}

export async function isFetchAllowed(url: string, fetchImpl?: typeof fetch): Promise<boolean> {
  const u = new URL(url);
  const policy = await getRobotsPolicy(url, fetchImpl);
  return policy.isAllowed(`${u.pathname}${u.search}`);
}

export function clearRobotsCache(): void {
  cache.clear();
}
