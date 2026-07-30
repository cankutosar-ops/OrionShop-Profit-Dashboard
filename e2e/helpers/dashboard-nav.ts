/**
 * e2e/helpers/dashboard-nav.ts
 *
 * Shared dashboard navigation for Business Contracts.
 *
 * Do NOT force "today" as the date range: when selected `to` is newer than
 * last successful sync, DashboardOperationalSync posts a sync and may
 * router.refresh(), which prolongs streaming and races assertions.
 *
 * Scope comes from E2E_SCOPE_PARAMS (company/account[/from/to]) only.
 */

import type { ScopedPage } from "../fixtures/base";
import { waitForDashboardReady } from "./wait-helpers";

/** Navigate to Dashboard and wait for PH-01 contract surfaces. */
export async function gotoDashboardReady(scopedPage: ScopedPage): Promise<void> {
  await scopedPage.goto("/");
  await waitForDashboardReady(scopedPage.page);
}
