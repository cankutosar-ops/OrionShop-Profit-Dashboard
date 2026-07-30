/**
 * e2e/smoke/08-warehouse-analytics-loads.spec.ts
 *
 * Level 1 Smoke — TC-S08: Warehouse Analytics page loads
 *
 * Verifies:
 *  1. Navigation to /inventory/warehouse-sales does not produce an error.
 *  2. The page's <main> content is rendered.
 *  3. The Inventory nav link is visible in the sidebar.
 */

import { test, expect } from "../fixtures/base";
import { waitForPageReady } from "../helpers/wait-helpers";
import { NAV } from "../helpers/selectors";

test.describe("TC-S08 · Warehouse Analytics page", () => {
  test.beforeEach(async ({ scopedPage }) => {
    await scopedPage.goto("/inventory/warehouse-sales");
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

  test("Inventory nav link is visible in the sidebar", async ({ scopedPage }) => {
    await expect(
      scopedPage.page.getByRole("link", { name: NAV.inventory })
    ).toBeVisible();
  });
});
