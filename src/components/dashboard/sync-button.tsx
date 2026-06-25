"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { getDefaultDateRange } from "@/lib/utils";

type SyncResult = {
  entity: string;
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  errors: string[];
};

export function SyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    setError(null);

    const range = getDefaultDateRange();

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: range.from,
          dateTo: range.to,
          entities: ["products", "orders", "sales", "finance"],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Sync failed");
      }

      const results = (data.results ?? []) as SyncResult[];
      const inserted = results.reduce((sum, r) => sum + r.recordsInserted, 0);
      const updated = results.reduce((sum, r) => sum + r.recordsUpdated, 0);
      const syncErrors = results.flatMap((r) => r.errors);

      if (syncErrors.length) {
        setError(syncErrors.slice(0, 3).join(" · "));
      }

      setMessage(`Synced: ${inserted} inserted, ${updated} updated`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Syncing…" : "Sync Wildberries"}
      </button>
      {message && <p className="text-xs text-success">{message}</p>}
      {error && <p className="max-w-xs text-right text-xs text-danger">{error}</p>}
    </div>
  );
}
