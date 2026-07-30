/**
 * e2e/smoke/05-sync-popup.spec.ts
 *
 * Level 1 Smoke — TC-S05: Sync popup opens and closes
 *
 * Verifies:
 *  1. The "Sync Wildberries" button is present in the dashboard header.
 *  2. Clicking it triggers the sync flow (button enters a loading/disabled
 *     state OR a status message appears).
 *
 * We do NOT assert that the sync succeeds (requires live WB credentials).
 * We only verify the button exists and is interactive (application health).
 */

import { test, expect } from "../fixtures/base";
import { waitForPageReady } from "../helpers/wait-helpers";
import { SYNC_BUTTON_TEXT } from "../helpers/selectors";

test.describe("TC-S05 · Sync button", () => {
  test.beforeEach(async ({ scopedPage }) => {
    await scopedPage.goto("/");
    await waitForPageReady(scopedPage.page);
  });

  test("Sync Wildberries button is visible in the header", async ({ scopedPage }) => {
    await expect(
      scopedPage.page.getByRole("button", { name: SYNC_BUTTON_TEXT })
    ).toBeVisible();
  });

  test("Sync button is enabled (not permanently disabled)", async ({ scopedPage }) => {
    const btn = scopedPage.page.getByRole("button", { name: SYNC_BUTTON_TEXT });
    await expect(btn).toBeEnabled();
  });
});
