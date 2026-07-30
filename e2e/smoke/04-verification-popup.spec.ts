/**
 * e2e/smoke/04-verification-popup.spec.ts
 *
 * Level 1 Smoke — TC-S04: Verification popup opens and closes
 *
 * Verifies:
 *  1. The "Verification" trigger button is present in the dashboard header.
 *  2. Clicking it opens the Sync Verification dialog.
 *  3. The dialog can be dismissed with the Close button.
 */

import { test, expect } from "../fixtures/base";
import { waitForPageReady } from "../helpers/wait-helpers";
import {
  VERIFICATION_BUTTON_TEXT,
  VERIFICATION_DIALOG_LABEL,
} from "../helpers/selectors";

test.describe("TC-S04 · Verification popup", () => {
  test.beforeEach(async ({ scopedPage }) => {
    await scopedPage.goto("/");
    await waitForPageReady(scopedPage.page);
  });

  test("Verification button is visible in the header", async ({ scopedPage }) => {
    await expect(
      scopedPage.page.getByRole("button", { name: VERIFICATION_BUTTON_TEXT })
    ).toBeVisible();
  });

  test("clicking Verification opens the dialog", async ({ scopedPage }) => {
    await scopedPage.page
      .getByRole("button", { name: VERIFICATION_BUTTON_TEXT })
      .click();

    await expect(
      scopedPage.page.locator(`[role="dialog"][aria-label="${VERIFICATION_DIALOG_LABEL}"]`)
    ).toBeVisible({ timeout: 8_000 });
  });

  test("dialog can be closed", async ({ scopedPage }) => {
    await scopedPage.page
      .getByRole("button", { name: VERIFICATION_BUTTON_TEXT })
      .click();

    const dialog = scopedPage.page.locator(
      `[role="dialog"][aria-label="${VERIFICATION_DIALOG_LABEL}"]`
    );
    await dialog.waitFor({ state: "visible", timeout: 8_000 });

    // Panel dismisses via Escape (no dedicated Close control in the header popup).
    await scopedPage.page.keyboard.press("Escape");

    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });
});
