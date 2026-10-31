import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmac(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Irreversible, salted identifier for IP addresses kept in logs. */
export function hashIp(ip: string | null | undefined, secret: string): string | null {
  if (!ip) return null;
  return hmac(secret, `ip:${ip}`).slice(0, 32);
}
