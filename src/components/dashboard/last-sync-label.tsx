"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DASHBOARD_SYNC_COMPLETE_EVENT } from "@/lib/dashboard-auto-sync-session";
import { fetchDashboardCompanies } from "@/lib/dashboard-lifecycle";
import { formatLastSyncTimestamp } from "@/lib/marketplace-sync-date";

/** Fixed-height last-sync block for the Dashboard toolbar. */
export function LastSyncLabel() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account");
  const [label, setLabel] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    function handleSyncComplete() {
      setRefreshKey((current) => current + 1);
    }

    window.addEventListener(DASHBOARD_SYNC_COMPLETE_EVENT, handleSyncComplete);
    return () => window.removeEventListener(DASHBOARD_SYNC_COMPLETE_EVENT, handleSyncComplete);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const companies = await fetchDashboardCompanies();
        if (cancelled) return;

        const account = companies
          .flatMap((company) => company.accounts)
          .find((row) => row.id === accountId);

        const lastSync =
          account?.last_successful_sync_at ?? account?.last_sync_at ?? null;

        if (!lastSync) {
          setLabel("Never");
          return;
        }

        setLabel(formatLastSyncTimestamp(lastSync));
      } catch {
        if (!cancelled) setLabel(null);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accountId, refreshKey]);

  if (!label) return null;

  return (
    <div
      className="flex h-9 min-w-[7.5rem] flex-col justify-center leading-tight"
      title={`Last Sync: ${label}`}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Last Sync
      </span>
      <span className="truncate text-xs tabular-nums text-foreground/90">{label}</span>
    </div>
  );
}
