/**
 * e2e/smoke/04-verification-popup.spec.ts
 *
 * Level 1 Smoke — TC-S04: Data Status popup opens and closes
 *
 * Verifies:
 *  1. The compact "Data Status" trigger is present in the dashboard header.
 *  2. The dialog exposes the five global synchronization sources only.
 *  3. The popup fits a narrow viewport and can be dismissed with Escape.
 */

import { test, expect } from "../fixtures/base";
import { waitForPageReady } from "../helpers/wait-helpers";
import {
  DATA_STATUS_BUTTON_TEXT,
  DATA_STATUS_DIALOG_LABEL,
} from "../helpers/selectors";

const freshnessFixture = {
  dates: {
    sales: "2026-09-20",
    orders: "2026-09-20",
    finance: "2026-09-18",
    ads: "2026-09-20",
    inventory: "2026-09-20",
  },
  finance: {
    last_error: "awaiting_publication",
    active_week_from: "2026-09-14",
    active_week_to: "2026-09-20",
    week_status: "in_progress",
  },
  lastSuccessfulSync: "2026-09-21T05:00:00.000Z",
};

test.describe("TC-S04 · Data Status popup", () => {
  test.beforeEach(async ({ scopedPage }) => {
    await scopedPage.page.route("**/api/data-freshness?**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(freshnessFixture) });
    });
    await scopedPage.goto("/");
    await waitForPageReady(scopedPage.page);
  });

  test("compact warning summary is visible in the header", async ({ scopedPage }) => {
    await expect(
      scopedPage.page.getByRole("button", { name: DATA_STATUS_BUTTON_TEXT })
    ).toContainText("1 warning");
  });

  test("details contain five sync sources and exclude Product Cost", async ({ scopedPage }) => {
    await scopedPage.page
      .getByRole("button", { name: DATA_STATUS_BUTTON_TEXT })
      .click();

    const dialog = scopedPage.page.getByRole("dialog", { name: DATA_STATUS_DIALOG_LABEL });
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    for (const source of ["Sales", "Orders", "Finance", "Ads", "Inventory"]) {
      await expect(dialog.getByText(source, { exact: true })).toBeVisible();
    }
    await expect(dialog.getByText("AWAITING_WB_PUBLICATION", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Product Cost", { exact: true })).toHaveCount(0);
  });

  test("dialog fits a mobile viewport and closes with Escape", async ({ scopedPage }) => {
    await scopedPage.page.setViewportSize({ width: 390, height: 844 });
    await scopedPage.page
      .getByRole("button", { name: DATA_STATUS_BUTTON_TEXT })
      .click();

    const dialog = scopedPage.page.getByRole("dialog", { name: DATA_STATUS_DIALOG_LABEL });
    await dialog.waitFor({ state: "visible", timeout: 8_000 });
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);

    await scopedPage.page.keyboard.press("Escape");

    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });
});
