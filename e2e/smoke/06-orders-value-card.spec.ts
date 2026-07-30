/**
 * e2e/smoke/06-orders-value-card.spec.ts
 *
 * Level 1 Smoke — TC-S06: Orders Value card is visible
 *
 * Verifies that the "Orders Value" MetricCard is rendered on the Dashboard.
 * This confirms the Wildberries KPIs section is mounted and the deferred
 * server component resolved without a fatal error.
 *
 * No numeric values are checked — only structural presence.
 */

import { test, expect } from "../fixtures/base";
import { waitForPageReady } from "../helpers/wait-helpers";
import { ORDERS_VALUE_CARD_TITLE } from "../helpers/selectors";

test.describe("TC-S06 · Orders Value card", () => {
  test.beforeEach(async ({ scopedPage }) => {
    await scopedPage.goto("/");
    await waitForPageReady(scopedPage.page);
  });

  test("Orders Value card title is present on the Dashboard", async ({ scopedPage }) => {
    // Deferred WB strip may wait on finance/balance APIs; allow longer than page-ready.
    await expect(
      scopedPage.page.getByText(ORDERS_VALUE_CARD_TITLE, { exact: true })
    ).toBeVisible({ timeout: 45_000 });
  });
});
