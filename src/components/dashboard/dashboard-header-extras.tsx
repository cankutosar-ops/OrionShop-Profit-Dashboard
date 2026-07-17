"use client";

import { Suspense } from "react";
import { LastSyncLabel } from "@/components/dashboard/last-sync-label";
import { MarketplaceDateScope } from "@/components/dashboard/marketplace-date-scope";

/** Dashboard header controls (scope + last sync). */
export function DashboardHeaderExtras() {
  return (
    <>
      <Suspense fallback={null}>
        <MarketplaceDateScope />
      </Suspense>
      <Suspense fallback={null}>
        <LastSyncLabel />
      </Suspense>
    </>
  );
}