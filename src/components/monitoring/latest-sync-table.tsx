"use client";

import { useCallback, useMemo } from "react";
import { SortableTh } from "@/components/ui/sortable-th";
import { HealthBadge } from "@/components/monitoring/health-badge";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import type { ProductionHealthReport } from "@/lib/production-health/types";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";

type SyncEntityRow = ProductionHealthReport["syncExecution"]["entities"][number];

type SyncSortKey =
  | "entity"
  | "startedAt"
  | "finishedAt"
  | "rowsInserted"
  | "rowsUpdated"
  | "rowsSkipped"
  | "result";

const DEFAULT_SORT = { key: "entity" as const, direction: "asc" as const };

function syncSortValue(row: SyncEntityRow, key: SyncSortKey): SortValue {
  switch (key) {
    case "entity":
      return row.entity;
    case "startedAt":
      return row.startedAt;
    case "finishedAt":
      return row.finishedAt;
    case "rowsInserted":
      return row.rowsInserted;
    case "rowsUpdated":
      return row.rowsUpdated;
    case "rowsSkipped":
      return row.rowsSkipped;
    case "result":
      return row.result;
  }
}

export function LatestSyncTable({ report }: { report: ProductionHealthReport }) {
  const sync = report.syncExecution;
  const { sort, onSort, directionFor, isActive } = useCycleSort<SyncSortKey>(DEFAULT_SORT);
  const getValue = useCallback((row: SyncEntityRow, key: SyncSortKey) => syncSortValue(row, key), []);
  const sortedEntities = useMemo(
    () => sortRowsBySpec(sync.entities, sort, getValue),
    [sync.entities, sort, getValue]
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Latest Sync</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Overall status: {sync.overallStatus}
            {sync.requestId ? ` · request ${sync.requestId}` : ""}
            {sync.error ? ` · ${sync.error}` : ""}
          </p>
        </div>
        <HealthBadge status={sync.overallStatus || "unknown"} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/80 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortableTh
                label="Entity"
                active={isActive("entity")}
                direction={directionFor("entity")}
                onClick={() => onSort("entity")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Started"
                active={isActive("startedAt")}
                direction={directionFor("startedAt")}
                onClick={() => onSort("startedAt")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Finished"
                active={isActive("finishedAt")}
                direction={directionFor("finishedAt")}
                onClick={() => onSort("finishedAt")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Inserted"
                active={isActive("rowsInserted")}
                direction={directionFor("rowsInserted")}
                onClick={() => onSort("rowsInserted")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Updated"
                active={isActive("rowsUpdated")}
                direction={directionFor("rowsUpdated")}
                onClick={() => onSort("rowsUpdated")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Skipped"
                active={isActive("rowsSkipped")}
                direction={directionFor("rowsSkipped")}
                onClick={() => onSort("rowsSkipped")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Result"
                active={isActive("result")}
                direction={directionFor("result")}
                onClick={() => onSort("result")}
                className="px-4 py-3 font-medium"
              />
              <th className="px-4 py-3 font-medium">Errors / Warnings</th>
            </tr>
          </thead>
          <tbody>
            {sortedEntities.map((row, idx) => (
              <tr key={`${row.entity}-${idx}`} className="border-b border-border/50 last:border-0 align-top">
                <td className="px-4 py-3 font-medium">{row.entity}</td>
                <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                  {row.startedAt ? new Date(row.startedAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                  {row.finishedAt ? new Date(row.finishedAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">{row.rowsInserted ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{row.rowsUpdated ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{row.rowsSkipped ?? "—"}</td>
                <td className="px-4 py-3">
                  <HealthBadge status={row.result} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {[...row.errors, ...row.warnings].slice(0, 3).join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
