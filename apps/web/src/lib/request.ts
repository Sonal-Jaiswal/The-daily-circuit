import "server-only";
import { headers } from "next/headers";
import { hashIp } from "@tdc/core/util/crypto";
import { siteUrl } from "./site";

/** Client IP as reported by Vercel / Cloudflare. Used only in hashed form. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function clientIpHash(): Promise<string | null> {
  return hashIp(await clientIp(), process.env.SESSION_SECRET ?? "dev-only-secret-value-not-for-prod");
}

/**
 * CSRF defence for route handlers that accept form/JSON posts from browsers: the Origin
 * (or Referer) must be our own site. Server Actions get the same check from Next.js.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const allowed = new Set([new URL(siteUrl()).host, request.headers.get("host") ?? ""]);
    return allowed.has(o.host);
  } catch {
    return false;
  }
}
