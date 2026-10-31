import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://tdc:tdc_local_dev@localhost:54329/tdc_e2e";
const env = {
  DATABASE_URL: E2E_DATABASE_URL,
  NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
  SESSION_SECRET: "e2e-session-secret-0123456789abcdefghijklmnop",
  INTERNAL_JOB_SECRET: "e2e-internal-secret-0123456789",
  EMAIL_TRANSPORT: "log",
  MARKET_DATA_PROVIDER: "none",
};

/**
 * End-to-end tests run a production build against a disposable, seeded database.
 * `npm run test:e2e` seeds, builds, starts the server and runs the browser tests.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /responsive\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: `npx tsx e2e/seed.ts && npm run build -w @tdc/web && npx next start apps/web -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env,
    stdout: "ignore",
    stderr: "pipe",
  },
});
