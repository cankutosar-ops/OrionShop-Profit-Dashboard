"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SortableTh } from "@/components/ui/sortable-th";
import { HealthBadge } from "@/components/monitoring/health-badge";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";

type HistoryRow = {
  id: string;
  verifiedAt: string;
  healthScore: number;
  overallResult: string;
  schemaStatus: string;
  ordersStatus: string;
  salesStatus: string;
  financeStatus: string;
  inventoryStatus: string;
  syncStatus: string | null;
  syncDurationMs: number | null;
  failuresCount: number;
};

type HistorySortKey =
  | "verifiedAt"
  | "healthScore"
  | "overallResult"
  | "schemaStatus"
  | "ordersStatus"
  | "salesStatus"
  | "financeStatus"
  | "inventoryStatus"
  | "syncDurationMs";

const DEFAULT_SORT = { key: "verifiedAt" as const, direction: "desc" as const };

function historySortValue(row: HistoryRow, key: HistorySortKey): SortValue {
  switch (key) {
    case "verifiedAt":
      return row.verifiedAt;
    case "healthScore":
      return row.healthScore;
    case "overallResult":
      return row.overallResult;
    case "schemaStatus":
      return row.schemaStatus;
    case "ordersStatus":
      return row.ordersStatus;
    case "salesStatus":
      return row.salesStatus;
    case "financeStatus":
      return row.financeStatus;
    case "inventoryStatus":
      return row.inventoryStatus;
    case "syncDurationMs":
      return row.syncDurationMs;
  }
}

export function VerificationHistoryPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account");
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { sort, onSort, directionFor, isActive } = useCycleSort<HistorySortKey>(DEFAULT_SORT);
  const getValue = useCallback((row: HistoryRow, key: HistorySortKey) => historySortValue(row, key), []);
  const sortedRows = useMemo(
    () => sortRowsBySpec(rows, sort, getValue),
    [rows, sort, getValue]
  );

  const trendPoints = useMemo(
    () =>
      [...sortedRows]
        .slice()
        .reverse()
        .map((r) => ({ at: r.verifiedAt, score: r.healthScore, result: r.overallResult })),
    [sortedRows]
  );

  useEffect(() => {
    if (!accountId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/monitoring/verification-history?marketplaceAccountId=${encodeURIComponent(accountId)}&limit=50`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load history");
        if (!cancelled) setRows(data.reports ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Verification History</h2>
        {loading ? <span className="text-xs text-muted-foreground">Loading…</span> : null}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Health Score Trend
        </p>
        {trendPoints.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No verification snapshots yet. Complete a sync to generate the first immutable report.
          </p>
        ) : (
          <div className="mt-3 flex h-24 items-end gap-1">
            {trendPoints.map((p) => (
              <div
                key={p.at}
                title={`${new Date(p.at).toLocaleString()} · ${p.score}% · ${p.result}`}
                className="flex-1 rounded-t bg-primary/70"
                style={{ height: `${Math.max(8, p.score)}%` }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/80 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortableTh
                label="Time"
                active={isActive("verifiedAt")}
                direction={directionFor("verifiedAt")}
                onClick={() => onSort("verifiedAt")}
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Score"
                active={isActive("healthScore")}
                direction={directionFor("healthScore")}
                onClick={() => onSort("healthScore")}
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Result"
                active={isActive("overallResult")}
                direction={directionFor("overallResult")}
                onClick={() => onSort("overallResult")}
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Schema"
                active={isActive("schemaStatus")}
                direction={directionFor("schemaStatus")}
                onClick={() => onSort("schemaStatus")}
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Orders"
                active={isActive("ordersStatus")}
                direction={directionFor("ordersStatus")}
                onClick={() => onSort("ordersStatus")}
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Sales"
                active={isActive("salesStatus")}
                direction={directionFor("salesStatus")}
                onClick={() => onSort("salesStatus")}
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Finance"
                active={isActive("financeStatus")}
                direction={directionFor("financeStatus")}
                onClick={() => onSort("financeStatus")}
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Inventory"
                active={isActive("inventoryStatus")}
                direction={directionFor("inventoryStatus")}
                onClick={() => onSort("inventoryStatus")}
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Duration"
                active={isActive("syncDurationMs")}
                direction={directionFor("syncDurationMs")}
                onClick={() => onSort("syncDurationMs")}
                className="px-3 py-3 font-medium"
              />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.id}
                className={`cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/40 ${
                  selectedId === row.id ? "bg-muted/50" : ""
                }`}
                onClick={() => onSelect(row.id)}
              >
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                  {new Date(row.verifiedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 tabular-nums font-medium">{row.healthScore}%</td>
                <td className="px-3 py-2">
                  <HealthBadge status={row.overallResult} />
                </td>
                <td className="px-3 py-2">
                  <HealthBadge status={row.schemaStatus} />
                </td>
                <td className="px-3 py-2">
                  <HealthBadge status={row.ordersStatus} />
                </td>
                <td className="px-3 py-2">
                  <HealthBadge status={row.salesStatus} />
                </td>
                <td className="px-3 py-2">
                  <HealthBadge status={row.financeStatus} />
                </td>
                <td className="px-3 py-2">
                  <HealthBadge status={row.inventoryStatus} />
                </td>
                <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground">
                  {row.syncDurationMs == null ? "—" : `${row.syncDurationMs} ms`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
