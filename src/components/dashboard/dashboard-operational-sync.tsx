"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  claimAutoSyncAttempt,
  markOperationalAutoSyncTriggered,
  notifyDashboardSyncComplete,
  releaseAutoSyncAttempt,
} from "@/lib/dashboard-auto-sync-session";
import { fetchDashboardCompanies } from "@/lib/dashboard-lifecycle";
import {
  getDashboardSyncInFlight,
  OPERATIONAL_SYNC_ENTITIES,
  postDashboardSync,
} from "@/lib/dashboard-sync-client";
import {
  isEndDateNewerThanLastSync,
  SYNC_DATE_PARAM,
} from "@/lib/marketplace-sync-date";
import { getDefaultDateRange } from "@/lib/utils";

function AutoSyncFailureBanner() {
  return (
    <div className="mb-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">
        Unable to synchronize the latest marketplace data.
      </p>
      <p className="mt-1">Please use the Sync Wildberries button.</p>
    </div>
  );
}

/**
 * Dashboard-only: sync orders + sales once per session when the selected end date
 * is newer than the marketplace last successful sync.
 */
export function DashboardOperationalSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [autoSyncFailed, setAutoSyncFailed] = useState(false);
  const refreshedRef = useRef(false);

  const accountId = searchParams.get("account");
  const fromDate = searchParams.get("from");
  const toDate = searchParams.get("to");
  const accountSwitched = searchParams.get(SYNC_DATE_PARAM.accountSwitched) === "1";

  useEffect(() => {
    setAutoSyncFailed(false);
    refreshedRef.current = false;
  }, [accountId, toDate]);

  useEffect(() => {
    if (pathname !== "/" || accountSwitched || !accountId) return;
    const activeAccountId = accountId;
    if (!claimAutoSyncAttempt(activeAccountId)) return;
    if (getDashboardSyncInFlight()) {
      releaseAutoSyncAttempt(activeAccountId);
      return;
    }

    const defaults = getDefaultDateRange();
    const from = fromDate ?? defaults.from;
    const to = toDate ?? defaults.to;

    let cancelled = false;

    async function maybeAutoSync() {
      try {
        const companies = await fetchDashboardCompanies();
        if (cancelled) return;

        const account = companies
          .flatMap((company) => company.accounts)
          .find((row) => row.id === activeAccountId);

        if (!account || account.sync_enabled === false) return;
        if (account.last_sync_status === "running") return;

        const lastSyncAt =
          account.last_successful_sync_at ?? account.last_sync_at ?? null;
        if (!isEndDateNewerThanLastSync(to, lastSyncAt)) return;
        if (getDashboardSyncInFlight()) return;

        markOperationalAutoSyncTriggered(activeAccountId);

        const result = await postDashboardSync({
          marketplaceAccountId: activeAccountId,
          dateFrom: from,
          dateTo: to,
          entities: OPERATIONAL_SYNC_ENTITIES,
        });

        if (cancelled) return;

        if (!result.ok) {
          setAutoSyncFailed(true);
          return;
        }

        notifyDashboardSyncComplete();
        if (!refreshedRef.current) {
          refreshedRef.current = true;
          router.refresh();
        }
      } catch {
        if (!cancelled) setAutoSyncFailed(true);
      } finally {
        releaseAutoSyncAttempt(activeAccountId);
      }
    }

    maybeAutoSync();
    return () => {
      cancelled = true;
    };
  }, [accountId, accountSwitched, fromDate, pathname, router, toDate]);

  if (!autoSyncFailed) return null;
  return <AutoSyncFailureBanner />;
}
