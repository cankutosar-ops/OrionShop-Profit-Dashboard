/**
 * e2e/smoke/03-dashboard-loads.spec.ts
 *
 * Level 1 Smoke — TC-S03: Dashboard loads
 *
 * Verifies that the Dashboard page renders its core structural elements:
 *  - The sidebar navigation
 *  - A heading or section that confirms we are on the Dashboard
 *
 * No KPI values are asserted — only structural presence.
 */

import { test, expect } from "../fixtures/base";
import { waitForPageReady } from "../helpers/wait-helpers";
import { SIDEBAR, NAV } from "../helpers/selectors";

test.describe("TC-S03 · Dashboard loads", () => {
  test.beforeEach(async ({ scopedPage }) => {
    await scopedPage.goto("/");
    await waitForPageReady(scopedPage.page);
  });

  test("sidebar navigation is visible", async ({ scopedPage }) => {
    await expect(scopedPage.page.locator(SIDEBAR)).toBeVisible();
  });

  test("Dashboard nav item is present in the sidebar", async ({ scopedPage }) => {
    await expect(
      scopedPage.page.getByRole("link", { name: NAV.dashboard })
    ).toBeVisible();
  });

  test("page does not show an unhandled error", async ({ scopedPage }) => {
    await expect(
      scopedPage.page.getByText("Application error", { exact: false })
    ).toHaveCount(0);
  });
});
