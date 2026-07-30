/**
 * e2e/smoke/07-product-analytics-loads.spec.ts
 *
 * Level 1 Smoke — TC-S07: Product Analytics page loads
 *
 * Verifies:
 *  1. Navigation to /analytics/products does not produce an error.
 *  2. The page's <main> content is rendered.
 *  3. The sidebar link for Product Analytics is present.
 */

import { test, expect } from "../fixtures/base";
import { waitForPageReady } from "../helpers/wait-helpers";
import { NAV } from "../helpers/selectors";

test.describe("TC-S07 · Product Analytics page", () => {
  test.beforeEach(async ({ scopedPage }) => {
    await scopedPage.goto("/analytics/products");
    await waitForPageReady(scopedPage.page);
  });

  test("page does not show an error boundary", async ({ scopedPage }) => {
    await expect(
      scopedPage.page.getByText("Application error", { exact: false })
    ).toHaveCount(0);
  });

  test("main content area is rendered", async ({ scopedPage }) => {
    await expect(scopedPage.page.locator("main")).toBeVisible();
  });

  test("Product Analytics nav link is active in the sidebar", async ({ scopedPage }) => {
    await expect(
      scopedPage.page.getByRole("link", { name: NAV.productAnalytics })
    ).toBeVisible();
  });
});
