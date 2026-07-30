/**
 * e2e/smoke/10-authz-security.spec.ts
 * Sprint 7.1.C — Authorization smoke (cross-tenant rejection).
 */

import { test, expect } from "../fixtures/base";

test.describe("TC-S10 · Authorization security", () => {
  test("authenticated session can list permitted companies", async ({ page }) => {
    const res = await page.request.get("/api/companies");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.companies)).toBe(true);
    expect(body.companies.length).toBeGreaterThan(0);
  });

  test("foreign marketplace account is forbidden", async ({ page }) => {
    const res = await page.request.get(
      "/api/sync/status?marketplaceAccountId=00000000-0000-4000-8000-000000000098"
    );
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toMatch(/^AUTHZ_/);
  });

  test("foreign company id is forbidden", async ({ page }) => {
    const res = await page.request.get(
      "/api/companies/00000000-0000-4000-8000-000000000099"
    );
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toMatch(/^AUTHZ_/);
  });

  test("spoofed body marketplaceAccountId is forbidden", async ({ page }) => {
    const res = await page.request.post("/api/sync", {
      data: {
        marketplaceAccountId: "00000000-0000-4000-8000-000000000098",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-02",
      },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toMatch(/^AUTHZ_/);
  });
});
