/**
 * e2e/smoke/02-login.spec.ts
 *
 * Level 1 Smoke — TC-S02: Login / session works (Sprint 7.1.B)
 */

import { test, expect } from "../fixtures/base";
import { waitForPageReady } from "../helpers/wait-helpers";

test.describe("TC-S02 · Login / session", () => {
  test("authenticated storageState reaches dashboard root", async ({ scopedPage }) => {
    await scopedPage.goto("/");
    expect(scopedPage.page.url()).not.toContain("/login");
    expect(scopedPage.page.url()).not.toContain("/error");
  });

  test("main layout is rendered after initial load", async ({ scopedPage }) => {
    await scopedPage.goto("/");
    await waitForPageReady(scopedPage.page);

    await expect(scopedPage.page.locator("main")).toBeVisible();
    await expect(
      scopedPage.page.getByText("Application error", { exact: false })
    ).toHaveCount(0);
  });

  test("session endpoint reports authenticated user", async ({ page }) => {
    const res = await page.request.get("/api/auth/session");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user?.id).toBeTruthy();
  });
});
