"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  getDashboardSyncInFlight,
  postDashboardSync,
  subscribeDashboardSync,
} from "@/lib/dashboard-sync-client";
import { notifyDashboardSyncComplete } from "@/lib/dashboard-auto-sync-session";
import { getDefaultDateRange } from "@/lib/utils";

/**
 * Sync control for the page header.
 * Status text uses title + aria-live so it never grows header height.
 */
export function SyncButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const externalSyncInFlight = useSyncExternalStore(
    subscribeDashboardSync,
    getDashboardSyncInFlight,
    () => false
  );

  const syncInFlight = loading || externalSyncInFlight;
  const statusText = error ?? message;

  const handleSync = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setError(null);

    const range = {
      from: searchParams.get("from") ?? getDefaultDateRange().from,
      to: searchParams.get("to") ?? getDefaultDateRange().to,
    };
    const marketplaceAccountId = searchParams.get("account");

    try {
      const result = await postDashboardSync({
        marketplaceAccountId,
        dateFrom: range.from,
        dateTo: range.to,
        entities: ["products", "orders", "sales", "finance", "stock"],
      });

      if (!result.ok) {
        throw new Error(result.error ?? "Sync failed");
      }

      const results = result.results ?? [];
      const inserted = results.reduce((sum, row) => sum + row.recordsInserted, 0);
      const updated = results.reduce((sum, row) => sum + row.recordsUpdated, 0);

      setMessage(`Synced: ${inserted} inserted, ${updated} updated`);
      notifyDashboardSyncComplete();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }, [router, searchParams]);

  return (
    <div className="relative inline-flex h-9 items-center">
      <button
        type="button"
        onClick={handleSync}
        disabled={syncInFlight}
        title={statusText ?? undefined}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${syncInFlight ? "animate-spin" : ""}`} />
        {syncInFlight ? "Syncing…" : "Sync Wildberries"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {statusText}
      </span>
      {statusText && (
        <span
          className={`pointer-events-none absolute right-0 top-full z-50 mt-1 max-w-[16rem] truncate rounded-md border border-border/60 bg-background px-2 py-0.5 text-[11px] shadow-sm ${
            error ? "text-danger" : "text-success"
          }`}
          title={statusText}
        >
          {statusText}
        </span>
      )}
    </div>
  );
}
