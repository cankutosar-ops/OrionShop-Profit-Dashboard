/**
 * e2e/helpers/wait-helpers.ts
 *
 * Reusable waiting utilities used across test suites.
 * Keep these pure (no test.step wrappers) so they compose cleanly inside
 * test bodies.
 *
 * PH-02.3: Never use fixed sleep(). Prefer locator.waitFor / expect.poll /
 * application-ready signals. Next.js App Router streaming means
 * waitUntil:"domcontentloaded" can hang on dashboard — navigation uses
 * "commit" (see fixtures/base.ts); readiness is asserted via semantic UI.
 */

import { expect, type Page } from "@playwright/test";

/**
 * Wait for the main content area to finish its initial layout paint.
 * Does NOT mean Suspense / RSC streams are complete — use page-specific
 * ready helpers for that.
 */
export async function waitForPageReady(page: Page, timeout = 15_000): Promise<void> {
  await page.locator("main").waitFor({ state: "attached", timeout });
}

/**
 * Dashboard application-ready signal for PH-01 business contracts.
 *
 * Commercial Performance streams inside DashboardCoreSection (Suspense).
 * Chart titles that contracts assert also live in that same core stream.
 * Waiting for these headings (attached) proves the streamed core has arrived
 * without depending on deferred Wildberries KPI Suspense or networkidle.
 */
export async function waitForDashboardReady(page: Page, timeout = 45_000): Promise<void> {
  await page.locator("main").waitFor({ state: "attached", timeout });

  const commercial = page.getByRole("heading", { name: "Commercial Performance" });
  await commercial.waitFor({ state: "attached", timeout });

  // Poll until core contract surfaces are present (handles mid-load router.refresh
  // from DashboardOperationalSync without arbitrary sleep).
  await expect
    .poll(
      async () => {
        const buyout = await page.getByRole("heading", { name: "Orders vs Buyout" }).count();
        const salesTrend = await page
          .getByRole("heading", { name: "Sales & Profit Trend" })
          .count();
        const operating = await page.getByText("Operating Profit", { exact: true }).count();
        const netProfit = await page.getByText("Net Profit", { exact: true }).count();
        return buyout > 0 && salesTrend > 0 && operating > 0 && netProfit > 0;
      },
      {
        timeout,
        message:
          "Dashboard core stream did not expose Commercial Performance contract surfaces",
      }
    )
    .toBe(true);
}

/**
 * Wait for a dialog / popup panel to become visible.
 */
export async function waitForDialog(page: Page, label: string, timeout = 10_000): Promise<void> {
  await page
    .locator(`[role="dialog"][aria-label="${label}"]`)
    .waitFor({ state: "visible", timeout });
}

/**
 * Dismiss a dialog / popup by clicking its close button (aria-label="Close").
 */
export async function closeDialog(page: Page, timeout = 5_000): Promise<void> {
  await page.locator('[aria-label="Close"]').click({ timeout });
}
