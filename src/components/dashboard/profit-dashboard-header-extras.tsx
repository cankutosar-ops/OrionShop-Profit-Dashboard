"use client";

import { Suspense } from "react";
import { LastSyncLabel } from "@/components/dashboard/last-sync-label";
import { MarketplaceDateScope } from "@/components/dashboard/marketplace-date-scope";
import { ProfitModelSwitcher } from "@/components/dashboard/profit-model-switcher";

/** Profit Dashboard V3 header controls (model switcher + scope). */
export function ProfitDashboardHeaderExtras() {
  return (
    <>
      <Suspense fallback={null}>
        <ProfitModelSwitcher />
      </Suspense>
      <Suspense fallback={null}>
        <MarketplaceDateScope />
      </Suspense>
      <Suspense fallback={null}>
        <LastSyncLabel />
      </Suspense>
    </>
  );
}
