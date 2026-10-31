import { execSync } from "node:child_process";
import path from "node:path";

/** Applies migrations to the dedicated test database before any integration test runs. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must point at a disposable database (see .env.example)");
  if (url === process.env.DATABASE_URL_PRODUCTION) throw new Error("Refusing to run tests against production");
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(import.meta.dirname, "../../../db"),
    env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
    stdio: "pipe",
  });
}
