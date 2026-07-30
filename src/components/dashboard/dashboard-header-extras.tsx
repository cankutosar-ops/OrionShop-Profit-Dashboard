"use client";

import { Suspense } from "react";
import { LastSyncLabel } from "@/components/dashboard/last-sync-label";
import { MarketplaceDateScope } from "@/components/dashboard/marketplace-date-scope";

/**
 * Dashboard toolbar extras.
 * MarketplaceDateScope is side-effect only (no UI).
 * Settlement status chip intentionally omitted — ambiguous for business users.
 */
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
