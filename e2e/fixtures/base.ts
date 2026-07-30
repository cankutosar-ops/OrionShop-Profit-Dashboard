/**
 * e2e/fixtures/base.ts
 *
 * Shared Playwright fixtures for every test in the suite.
 *
 * Extending the base `test` here keeps helpers DRY:
 *  - `scopedPage` — a Page pre-navigated with the global scope params so every
 *    test does not have to repeat scope query string assembly.
 *  - All standard Playwright fixture extensions go here; individual test files
 *    import `{ test, expect }` from this module, NOT from `@playwright/test`.
 *
 * PH-02.3 navigation note:
 * Next.js App Router streams HTML for Suspense boundaries. Waiting for
 * "domcontentloaded" / "load" can hang indefinitely on `/` while the document
 * stream stays open (deferred WB KPIs, RSC). Use waitUntil:"commit" so
 * navigation returns when the document is committed; then wait on semantic
 * application-ready signals in helpers.
 */

import { test as base, expect } from "@playwright/test";
import { buildUrl } from "../config/e2e-env";

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export type OrionFixtures = {
  /**
   * A Page that navigates to `path` with scope params automatically applied.
   * Usage:  await scopedPage.goto("/analytics/products")
   */
  scopedPage: ScopedPage;
};

export interface ScopedPage {
  goto(path: string, extraParams?: Record<string, string>): Promise<void>;
  readonly page: import("@playwright/test").Page;
}

// -------------------------------------------------------------------------
// Extended test object
// -------------------------------------------------------------------------

export const test = base.extend<OrionFixtures>({
  scopedPage: async ({ page }, use) => {
    const scoped: ScopedPage = {
      page,
      async goto(path: string, extraParams?: Record<string, string>) {
        const url = buildUrl(path, extraParams);
        // "commit" returns as soon as the response is committed — safe with
        // Next.js streaming. Do NOT use domcontentloaded/load/networkidle here.
        await page.goto(url, { waitUntil: "commit" });
      },
    };
    await use(scoped);
  },
});

export { expect };
