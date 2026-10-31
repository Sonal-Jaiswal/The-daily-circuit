import { expect, test } from "@playwright/test";

for (const path of ["/", "/ai/example-labs-releases-fixture-model", "/markets", "/editorial-policy"]) {
  test(`no horizontal scrolling at phone width: ${path}`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("mobile menu opens and navigates", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Menu", { exact: true }).click();
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Indian Markets" }).click();
  await expect(page).toHaveURL(/\/markets$/);
});

test("screenshots for visual review", async ({ page }, info) => {
  await page.goto("/");
  await page.screenshot({ path: info.outputPath("home-mobile.png"), fullPage: true });
  await page.goto("/ai/example-labs-releases-fixture-model");
  await page.screenshot({ path: info.outputPath("article-mobile.png"), fullPage: true });
});
