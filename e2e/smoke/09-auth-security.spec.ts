/**
 * e2e/smoke/09-auth-security.spec.ts
 *
 * Sprint 7.1.B — Authentication security smoke (unauthenticated contexts).
 * Keeps Sprint 7.1.A containment checks intact.
 */

import { test, expect } from "@playwright/test";
import { buildUrl } from "../config/e2e-env";

test.describe("TC-S09 · Auth security", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("missing session redirects document navigations to /login", async ({ page }) => {
    const res = await page.goto(buildUrl("/"), { waitUntil: "commit" });
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login/);
  });

  test("missing session rejects protected API with AUTH_REQUIRED or CONTAINMENT_GATE", async ({
    request,
  }) => {
    const res = await request.get(buildUrl("/api/companies"));
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(["AUTH_REQUIRED", "CONTAINMENT_GATE"]).toContain(body.code);
  });

  test("spoofed auth cookie is rejected", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "sb-access-token",
        value: "tampered.invalid.token",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    await page.goto(buildUrl("/"), { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("login rejects invalid credentials", async ({ page }) => {
    await page.goto(buildUrl("/login"), { waitUntil: "commit" });
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("containment still blocks raw API without gate cookie", async ({ request }) => {
    // Fresh request context: no cookies.
    const res = await request.get(buildUrl("/api/brands"));
    expect(res.status()).toBe(401);
    const body = await res.json();
    // Without containment cookie, gate fires first; with cookie only, AUTH_REQUIRED.
    expect(["CONTAINMENT_GATE", "AUTH_REQUIRED"]).toContain(body.code);
  });
});
