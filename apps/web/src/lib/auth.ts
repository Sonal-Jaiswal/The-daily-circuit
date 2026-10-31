import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "@tdc/db";
import { can, type Permission } from "@tdc/core/auth/rbac";
import { getSession, SESSION_COOKIE, type SessionUser } from "@tdc/core/auth/session";

export type { SessionUser };

/** Reads and validates the session cookie. Call only inside a Suspense boundary or an action. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await getSession(getPrisma(), token);
  return session?.user ?? null;
}

/** Data-access-layer guard: redirects to login, or to the dashboard when the role lacks permission. */
export async function requireUser(permission: Permission = "dashboard:view"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, permission)) redirect("/admin?denied=1");
  return user;
}

/** For server actions: throw instead of redirect so forms can show the error. */
export async function authorize(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Your session has expired. Sign in again.");
  if (!can(user.role, permission)) throw new Error("Your role does not allow this action.");
  return user;
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
