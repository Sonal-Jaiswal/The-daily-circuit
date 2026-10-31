/**
 * Creates (or resets the password of) an administrator from environment variables:
 *   ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD, optional ADMIN_NAME
 * Credentials are never stored in seed files or the repository.
 */
import path from "node:path";
import { config } from "dotenv";
import { createPrismaClient } from "@tdc/db";
import { hashPassword } from "../src/auth/password";
import { destroyAllSessions } from "../src/auth/session";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD");
  const prisma = createPrismaClient();
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name: process.env.ADMIN_NAME ?? "Administrator", role: "ADMIN", passwordHash },
      update: { passwordHash, role: "ADMIN", isActive: true },
    });
    await destroyAllSessions(prisma, user.id);
    console.log(`Administrator ready: ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
