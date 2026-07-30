/**
 * e2e/smoke/01-app-starts.spec.ts
 *
 * Level 1 Smoke — TC-S01: Application starts
 *
 * Verifies that the HTTP server responds and the root HTML document is
 * delivered.  No UI interaction is required.
 *
 * Note: `/` uses Next.js RSC streaming — waiting for full body / "load" can
 * hang while deferred sections stream. Use waitUntil:"commit".
 */

import { test, expect } from "../fixtures/base";

test.describe("TC-S01 · Application starts", () => {
  test("root URL returns a 200 response", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "commit" });
    expect(response?.status()).toBe(200);
  });

  test("root page contains a <html> element", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    const html = page.locator("html");
    await expect(html).toBeAttached();
  });
});
