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

  const handleSync = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setError(null);

    const range = getDefaultDateRange();
    const marketplaceAccountId = searchParams.get("account");

    try {
      const result = await postDashboardSync({
        marketplaceAccountId,
        dateFrom: range.from,
        dateTo: range.to,
        entities: ["products", "orders", "sales", "finance"],
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
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleSync}
        disabled={syncInFlight}
        className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${syncInFlight ? "animate-spin" : ""}`} />
        {syncInFlight ? "Syncing…" : "Sync Wildberries"}
      </button>
      {message && <p className="text-xs text-success">{message}</p>}
      {error && <p className="max-w-xs text-right text-xs text-danger">{error}</p>}
    </div>
  );
}
