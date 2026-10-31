import type { PrismaClient, Role } from "@tdc/db";
import { randomToken, sha256 } from "../util/crypto";
import { dummyPasswordHash, verifyPassword } from "./password";

export const SESSION_COOKIE = "tdc_session";
export const SESSION_TTL_MS = 7 * 24 * 3_600_000;
const TOUCH_AFTER_MS = 60 * 60_000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface ActiveSession {
  sessionId: string;
  expiresAt: Date;
  user: SessionUser;
}

/** Returns the raw token for the cookie. Only its SHA-256 is stored. */
export async function createSession(prisma: PrismaClient, userId: string, meta: { ipHash?: string | null; userAgent?: string | null } = {}) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, ipHash: meta.ipHash ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null },
  });
  return { token, expiresAt };
}

/** Validates a cookie token; slides the expiry forward at most once an hour. */
export async function getSession(prisma: PrismaClient, token: string | undefined | null): Promise<ActiveSession | null> {
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || !session.user.isActive) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) } });
  }
  const { user } = session;
  return { sessionId: session.id, expiresAt: session.expiresAt, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export async function destroySession(prisma: PrismaClient, token: string | undefined | null): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function destroyAllSessions(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Credential check with constant work whether or not the account exists. */
export async function authenticate(prisma: PrismaClient, email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyPasswordHash()));
  if (!user || !ok || !user.isActive) return null;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function purgeExpiredSessions(prisma: PrismaClient): Promise<number> {
  return (await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })).count;
}
