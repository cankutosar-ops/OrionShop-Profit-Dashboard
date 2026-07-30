"use client";

import { useCallback, useMemo } from "react";
import { SortableTh } from "@/components/ui/sortable-th";
import { HealthBadge } from "@/components/monitoring/health-badge";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import type { ProductionHealthReport } from "@/lib/production-health/types";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";

type CoverageRow = ProductionHealthReport["coverage"][number];

type CoverageSortKey =
  | "label"
  | "databaseLatestDate"
  | "expectedLatestApiDate"
  | "gapDays"
  | "status"
  | "behindApi";

const DEFAULT_SORT = { key: "gapDays" as const, direction: "desc" as const };

function coverageSortValue(row: CoverageRow, key: CoverageSortKey): SortValue {
  switch (key) {
    case "label":
      return row.label;
    case "databaseLatestDate":
      return row.databaseLatestDate;
    case "expectedLatestApiDate":
      return row.expectedLatestApiDate;
    case "gapDays":
      return row.gapDays;
    case "status":
      return row.status;
    case "behindApi":
      return row.behindApi ? 1 : 0;
  }
}

export function CoverageTable({ report }: { report: ProductionHealthReport }) {
  const { sort, onSort, directionFor, isActive } = useCycleSort<CoverageSortKey>(DEFAULT_SORT);
  const getValue = useCallback(
    (row: CoverageRow, key: CoverageSortKey) => coverageSortValue(row, key),
    []
  );
  const sortedCoverage = useMemo(
    () => sortRowsBySpec(report.coverage, sort, getValue),
    [report.coverage, sort, getValue]
  );

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">API vs Database Coverage</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Expected latest API date uses the operational freshness target (calendar{" "}
          {report.expectedAsOf}). Behind API = database lags that target beyond entity thresholds.
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/80 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortableTh
                label="Entity"
                active={isActive("label")}
                direction={directionFor("label")}
                onClick={() => onSort("label")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Database latest"
                active={isActive("databaseLatestDate")}
                direction={directionFor("databaseLatestDate")}
                onClick={() => onSort("databaseLatestDate")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Expected latest API"
                active={isActive("expectedLatestApiDate")}
                direction={directionFor("expectedLatestApiDate")}
                onClick={() => onSort("expectedLatestApiDate")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Gap (days)"
                active={isActive("gapDays")}
                direction={directionFor("gapDays")}
                onClick={() => onSort("gapDays")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Coverage"
                active={isActive("status")}
                direction={directionFor("status")}
                onClick={() => onSort("status")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Behind API"
                active={isActive("behindApi")}
                direction={directionFor("behindApi")}
                onClick={() => onSort("behindApi")}
                className="px-4 py-3 font-medium"
              />
            </tr>
          </thead>
          <tbody>
            {sortedCoverage.map((row) => (
              <tr key={row.entity} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{row.label}</td>
                <td className="px-4 py-3 tabular-nums">{row.databaseLatestDate ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{row.expectedLatestApiDate}</td>
                <td className="px-4 py-3 tabular-nums">
                  {row.gapDays == null ? "—" : row.gapDays}
                </td>
                <td className="px-4 py-3">
                  <HealthBadge status={row.status} />
                </td>
                <td className="px-4 py-3">
                  {row.behindApi ? (
                    <span className="text-amber-700 dark:text-amber-400">Yes</span>
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
