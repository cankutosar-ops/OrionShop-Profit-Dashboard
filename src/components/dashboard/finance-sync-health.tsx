"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { DASHBOARD_SYNC_COMPLETE_EVENT } from "@/lib/dashboard-auto-sync-session";
import {
  getDashboardSyncInFlight,
  subscribeDashboardSync,
} from "@/lib/dashboard-sync-client";

type FinanceHealth = {
  lookbackDays: number | null;
  gapWarnDays: number | null;
  latestOperationDate: string | null;
  latestReportId: number | null;
  gapDays: number | null;
  recoveryNeeded: boolean;
  lastSyncRunStatus: string | null;
  missingDays: string[];
  lateReportIds: number[];
  rowsUpserted: number | null;
  warnings: unknown[];
};

/**
 * Compact settlement-data health for the page header.
 * Business wording only — single-line so header height stays constant.
 */
export function FinanceSyncHealth() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account");
  const [health, setHealth] = useState<FinanceHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    function onComplete() {
      setRefreshKey((k) => k + 1);
    }
    window.addEventListener(DASHBOARD_SYNC_COMPLETE_EVENT, onComplete);
    const unsub = subscribeDashboardSync(() => setRefreshKey((k) => k + 1));
    return () => {
      window.removeEventListener(DASHBOARD_SYNC_COMPLETE_EVENT, onComplete);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!accountId) {
      setHealth(null);
      return;
    }
    const marketplaceAccountId = accountId;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/sync/status?marketplaceAccountId=${encodeURIComponent(marketplaceAccountId)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;
        setHealth(data.financeHealth ?? null);
      } catch {
        if (!cancelled) setHealth(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accountId, refreshKey]);

  const handleRecover = useCallback(async () => {
    if (!accountId || getDashboardSyncInFlight()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/finance-recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplaceAccountId: accountId, blocking: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refresh failed");

      const started = Date.now();
      while (Date.now() - started < 15 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await fetch(
          `/api/sync/status?marketplaceAccountId=${encodeURIComponent(accountId)}`,
          { cache: "no-store" }
        );
        const body = await st.json();
        if (body.status !== "running") break;
      }
      setRefreshKey((k) => k + 1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  }, [accountId, router]);

  if (!accountId || !health) return null;

  const gap = health.gapDays ?? 0;
  const behind = health.recoveryNeeded || gap > (health.gapWarnDays ?? 3);
  const latestDate = health.latestOperationDate;
  const statusLabel = behind
    ? gap > 0
      ? `${gap} day${gap === 1 ? "" : "s"} behind`
      : "Incomplete"
    : "Up to date";
  const missingCount = health.missingDays?.length ?? 0;
  const detail = [
    "Settlement Data",
    `Latest settlement date: ${latestDate ?? "Not available yet"}`,
    `Status: ${statusLabel}`,
    missingCount > 0 ? `Missing periods: ${missingCount}` : "Missing periods: None",
    health.lateReportIds.length > 0
      ? `New reports available: ${health.lateReportIds.length}`
      : null,
    error,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="inline-flex h-9 max-w-[min(100%,22rem)] items-center gap-1.5 rounded-xl border border-border/60 bg-card/40 px-2.5 text-xs text-muted-foreground"
      title={detail}
    >
      <span className="shrink-0 font-medium text-foreground/90">Settlement</span>
      <span
        className={`min-w-0 truncate tabular-nums ${
          behind ? "font-medium text-danger" : "text-foreground"
        }`}
      >
        {latestDate ? (
          <>
            {latestDate}
            <span className={behind ? "text-danger" : "text-muted-foreground"}>
              {" "}
              · {statusLabel}
            </span>
          </>
        ) : (
          statusLabel
        )}
      </span>
      {behind && (
        <button
          type="button"
          onClick={handleRecover}
          disabled={loading}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-1.5 text-[11px] font-medium text-danger hover:bg-danger/15 disabled:opacity-50"
          title={error ?? "Refresh settlement data for recent periods"}
        >
          {loading ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          <span className="hidden sm:inline">{loading ? "…" : "Refresh"}</span>
        </button>
      )}
    </div>
  );
}
