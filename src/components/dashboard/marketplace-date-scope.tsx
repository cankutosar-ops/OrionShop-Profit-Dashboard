"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fetchDashboardCompanies, replaceUrlIfChanged } from "@/lib/dashboard-lifecycle";
import {
  lastSyncDateKey,
  rangeExtendsBeyondLastSync,
  SYNC_DATE_PARAM,
} from "@/lib/marketplace-sync-date";
import { getDefaultDateRange } from "@/lib/utils";

/**
 * Dashboard-only: one-time date clamp immediately after a marketplace account switch.
 */
export function MarketplaceDateScope() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resolvingRef = useRef(false);
  const resolvedQueryRef = useRef<string | null>(null);

  const accountSwitched = searchParams.get(SYNC_DATE_PARAM.accountSwitched) === "1";
  const dateManual = searchParams.get(SYNC_DATE_PARAM.manual) === "1";
  const accountId = searchParams.get("account");
  const fromDate = searchParams.get("from");
  const toDate = searchParams.get("to");
  const currentQuery = searchParams.toString();

  useEffect(() => {
    if (pathname !== "/" || !accountSwitched || dateManual || !accountId) return;
    if (resolvingRef.current || resolvedQueryRef.current === currentQuery) return;

    const defaults = getDefaultDateRange();
    const from = fromDate ?? defaults.from;
    const to = toDate ?? defaults.to;

    let cancelled = false;
    resolvingRef.current = true;

    function clearAccountSwitchedFlag(needsAdjust: boolean, lastSyncDay: string | null) {
      const changed = replaceUrlIfChanged(router, pathname, currentQuery, (draft) => {
        draft.delete(SYNC_DATE_PARAM.accountSwitched);
        if (needsAdjust && lastSyncDay) {
          draft.set("from", lastSyncDay);
          draft.set("to", lastSyncDay);
          draft.set(SYNC_DATE_PARAM.adjusted, "1");
          draft.delete(SYNC_DATE_PARAM.manual);
        }
      });

      if (!changed) {
        resolvedQueryRef.current = currentQuery;
      }
    }

    async function resolveAfterSwitch() {
      try {
        const companies = await fetchDashboardCompanies();
        if (cancelled) return;

        const account = companies
          .flatMap((company) => company.accounts)
          .find((row) => row.id === accountId);

        const lastSyncAt =
          account?.last_successful_sync_at ?? account?.last_sync_at ?? null;
        const lastSyncDay = lastSyncDateKey(lastSyncAt);

        const needsAdjust =
          !!lastSyncDay &&
          rangeExtendsBeyondLastSync(from, to, lastSyncAt) &&
          !(from === lastSyncDay && to === lastSyncDay);

        clearAccountSwitchedFlag(needsAdjust, lastSyncDay);
      } catch {
        if (!cancelled) {
          clearAccountSwitchedFlag(false, null);
        }
      } finally {
        resolvingRef.current = false;
      }
    }

    resolveAfterSwitch();
    return () => {
      cancelled = true;
      resolvingRef.current = false;
    };
  }, [
    accountId,
    accountSwitched,
    currentQuery,
    dateManual,
    fromDate,
    pathname,
    router,
    toDate,
  ]);

  return null;
}
