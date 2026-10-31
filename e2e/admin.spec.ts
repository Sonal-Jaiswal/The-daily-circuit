import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("admin authentication and authorisation", () => {
  test("dashboard requires a session", async ({ page }) => {
    await page.goto("/admin/articles");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("a forged session cookie is rejected server-side", async ({ page, context }) => {
    await context.addCookies([{ name: "tdc_session", value: "forged-token-value", url: "http://localhost:3100" }]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("wrong credentials are refused", async ({ page }) => {
    await signIn(page, "admin@e2e.test", "not-the-right-password");
    await expect(page.getByText("That email and password combination is not valid.")).toBeVisible();
  });

  test("admins see the dashboard and settings", async ({ page }) => {
    await signIn(page, "admin@e2e.test", "e2e-admin-password-123");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Daily publication history")).toBeVisible();
    await expect(page.getByText("Run a pipeline stage")).toBeVisible();
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.goto("/admin/articles?status=NEEDS_REVIEW");
    await page.getByRole("link", { name: "Fixture article awaiting editorial review" }).click();
    await expect(page.getByText("Needs an editor's judgement")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve for publication" })).toBeEnabled();
  });

  test("editors cannot open admin-only pages", async ({ page }) => {
    await signIn(page, "editor@e2e.test", "e2e-editor-password-123");
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/settings");
    await expect(page).toHaveURL(/\/admin\?denied=1$/);
    await expect(page.getByText("Your role does not have access")).toBeVisible();
  });

  test("dashboard pages are never indexed", async ({ request }) => {
    const res = await request.get("/admin/login");
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
  });
});
