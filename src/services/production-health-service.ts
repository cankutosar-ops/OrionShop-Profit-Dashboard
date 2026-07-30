import { toDateString } from "@/lib/wildberries/mappers";
import {
  computeProductionHealthScore,
  FRESHNESS_WARN_DAYS,
  freshnessStatus,
  overallLabelFromScore,
} from "@/lib/production-health/score";
import type {
  CoverageRow,
  FreshnessRow,
  MonitoredEntity,
  OperationalAlert,
  ProductionHealthReport,
  SchemaHealthView,
  SyncExecutionRow,
} from "@/lib/production-health/types";
import { checkSchemaCompatibility } from "@/lib/schema-compatibility-check";
import { getMarketplaceAccountSyncState } from "@/services/marketplace-account-service";
import { getDashboardSyncStatus } from "@/services/sync-job-service";
import { runSyncVerification } from "@/services/sync-verification-service";

function todayCalendarDate(): string {
  return toDateString(new Date().toISOString());
}

function daysBetween(latest: string | null, expected: string): number | null {
  if (!latest) return null;
  const a = Date.parse(`${latest}T00:00:00.000Z`);
  const b = Date.parse(`${expected}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function mapEntity(source: string): MonitoredEntity | null {
  if (source === "orders" || source === "sales" || source === "finance" || source === "inventory") {
    return source;
  }
  return null;
}

function buildAlerts(input: {
  freshness: FreshnessRow[];
  coverage: CoverageRow[];
  schema: SchemaHealthView;
  syncStatus: string | null;
  syncError: string | null;
  entityErrors: SyncExecutionRow[];
}): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  if (input.schema.status === "FAIL") {
    for (const miss of input.schema.missing) {
      alerts.push({
        id: `schema-${miss.table}-${miss.column}`,
        severity: "critical",
        title: "Schema mismatch",
        detail: `Missing column ${miss.table}.${miss.column} (expected migration ${miss.expectedMigration}).`,
        entity: "schema",
      });
    }
  }

  for (const row of input.coverage) {
    if (!row.behindApi) continue;
    const severity = row.status === "critical" ? "critical" : "warning";
    alerts.push({
      id: `coverage-${row.entity}`,
      severity,
      title: `${row.label} behind API freshness target`,
      detail: `Database latest ${row.databaseLatestDate ?? "(none)"} is ${row.gapDays ?? "?"} day(s) behind expected ${row.expectedLatestApiDate}.`,
      entity: row.entity,
    });
  }

  for (const row of input.freshness) {
    if (row.status === "healthy") continue;
    // Avoid duplicate coverage alerts for the same lag signal when coverage already warned.
    if (input.coverage.some((c) => c.entity === row.entity && c.behindApi)) continue;
    alerts.push({
      id: `freshness-${row.entity}`,
      severity: row.status,
      title: `${row.label} data freshness ${row.status}`,
      detail:
        row.daysBehind != null
          ? `Latest DB date ${row.latestDbDate} is ${row.daysBehind} day(s) behind ${row.expectedAsOf}.`
          : `No ${row.label.toLowerCase()} records in database.`,
      entity: row.entity,
    });
  }

  const sync = (input.syncStatus ?? "").toLowerCase();
  if (sync === "failed") {
    alerts.push({
      id: "sync-failed",
      severity: "critical",
      title: "Repeated / last sync failed",
      detail: input.syncError ?? "Last account sync status is failed.",
      entity: "sync",
    });
  } else if (sync === "partial" || sync === "warning") {
    alerts.push({
      id: "sync-partial",
      severity: "warning",
      title: "Partial sync",
      detail: "Last sync completed with partial/warning status.",
      entity: "sync",
    });
  }

  for (const entity of input.entityErrors) {
    if (!entity.errors.length) continue;
    alerts.push({
      id: `sync-entity-${entity.entity}`,
      severity: entity.result === "failed" ? "critical" : "warning",
      title: `Sync errors: ${entity.entity}`,
      detail: entity.errors.slice(0, 3).join(" · "),
      entity: "sync",
    });
  }

  return alerts;
}

/**
 * Read-only production health snapshot for one marketplace account.
 * Never writes. Never triggers sync. Never repairs.
 */
export async function getProductionHealthReport(
  marketplaceAccountId: string
): Promise<ProductionHealthReport> {
  const expectedAsOf = todayCalendarDate();
  const generatedAt = new Date().toISOString();

  const [verification, syncStatus, schemaProbe, account] = await Promise.all([
    runSyncVerification(marketplaceAccountId),
    getDashboardSyncStatus(marketplaceAccountId),
    checkSchemaCompatibility(),
    getMarketplaceAccountSyncState(marketplaceAccountId),
  ]);

  const freshness: FreshnessRow[] = verification.sources.map((source) => {
    const entity = mapEntity(source.source)!;
    const empty = source.recordCount === 0 || !source.latestDate;
    const status = freshnessStatus(source.daysBehindExpected, entity, empty);
    return {
      entity,
      label: source.label,
      latestDbDate: source.latestDate,
      expectedAsOf,
      daysBehind: source.daysBehindExpected,
      recordCount: source.recordCount,
      status,
    };
  });

  // Coverage uses the same calendar freshness target as the verification layer.
  // "Expected latest API date" = operational freshness target (today UTC date).
  const coverage: CoverageRow[] = freshness.map((row) => {
    const gapDays = daysBetween(row.latestDbDate, expectedAsOf);
    const warn = FRESHNESS_WARN_DAYS[row.entity];
    const behindApi = gapDays != null ? gapDays > warn : row.latestDbDate == null;
    return {
      entity: row.entity,
      label: row.label,
      databaseLatestDate: row.latestDbDate,
      expectedLatestApiDate: expectedAsOf,
      gapDays,
      status: row.status,
      behindApi,
    };
  });

  const entityRows: SyncExecutionRow[] = (syncStatus.results ?? []).map((row) => {
    const hasErrors = (row.errors?.length ?? 0) > 0;
    return {
      entity: row.entity,
      startedAt: syncStatus.startedAt,
      finishedAt: syncStatus.finishedAt,
      durationMs: null,
      rowsInserted: row.recordsInserted ?? null,
      rowsUpdated: row.recordsUpdated ?? null,
      rowsSkipped: null,
      errors: row.errors ?? [],
      warnings: [],
      result: hasErrors ? "partial" : "success",
    };
  });

  if (!entityRows.length) {
    entityRows.push({
      entity: "(last job)",
      startedAt: syncStatus.startedAt ?? account?.last_sync_at ?? null,
      finishedAt: syncStatus.finishedAt ?? account?.last_successful_sync_at ?? null,
      durationMs: null,
      rowsInserted: null,
      rowsUpdated: null,
      rowsSkipped: null,
      errors: syncStatus.error ? [syncStatus.error] : [],
      warnings: [],
      result:
        syncStatus.status === "failed"
          ? "failed"
          : syncStatus.status === "partial" || syncStatus.status === "warning"
            ? "partial"
            : syncStatus.status === "success"
              ? "success"
              : "unknown",
    });
  }

  // Enrich finance row with durable sync_runs metrics when present.
  if (syncStatus.financeHealth) {
    const fh = syncStatus.financeHealth;
    const financeIdx = entityRows.findIndex((r) => r.entity === "finance");
    const financeRow: SyncExecutionRow = {
      entity: "finance",
      startedAt: syncStatus.startedAt,
      finishedAt: syncStatus.finishedAt,
      durationMs: null,
      rowsInserted: null,
      rowsUpdated: fh.rowsUpserted,
      rowsSkipped: null,
      errors: [],
      warnings: (fh.warnings ?? []).map((w) => String(w)).slice(0, 5),
      result:
        fh.lastSyncRunStatus === "failed"
          ? "failed"
          : fh.lastSyncRunStatus === "partial" || fh.lastSyncRunStatus === "warning"
            ? "partial"
            : fh.lastSyncRunStatus
              ? "success"
              : "unknown",
    };
    if (financeIdx >= 0) {
      entityRows[financeIdx] = {
        ...entityRows[financeIdx],
        rowsUpdated: entityRows[financeIdx].rowsUpdated ?? financeRow.rowsUpdated,
        warnings: [...entityRows[financeIdx].warnings, ...financeRow.warnings],
        result:
          entityRows[financeIdx].result === "success" && financeRow.result !== "unknown"
            ? financeRow.result
            : entityRows[financeIdx].result,
      };
    } else {
      entityRows.push(financeRow);
    }
  }

  const schema: SchemaHealthView = !schemaProbe
    ? { status: "UNKNOWN", checkedAt: null, missing: [] }
    : {
        status: schemaProbe.compatible ? "PASS" : "FAIL",
        checkedAt: schemaProbe.checkedAt,
        missing: schemaProbe.missing.map((m) => ({
          table: m.table,
          column: m.column,
          expectedMigration: m.expectedMigration,
        })),
      };

  const alerts = buildAlerts({
    freshness,
    coverage,
    schema,
    syncStatus: syncStatus.status,
    syncError: syncStatus.error,
    entityErrors: entityRows,
  });

  const scoreValue = computeProductionHealthScore({
    schemaPass: schema.status !== "FAIL",
    freshness,
    syncStatus: syncStatus.status,
    alertCriticalCount: alerts.filter((a) => a.severity === "critical").length,
    alertWarningCount: alerts.filter((a) => a.severity === "warning").length,
  });

  return {
    marketplaceAccountId,
    generatedAt,
    expectedAsOf,
    lastAccountSyncAt: account?.last_sync_at ?? null,
    lastAccountSyncStatus: account?.last_sync_status ?? syncStatus.status,
    freshness,
    coverage,
    syncExecution: {
      overallStatus: syncStatus.status,
      startedAt: syncStatus.startedAt,
      finishedAt: syncStatus.finishedAt,
      requestId: syncStatus.requestId,
      error: syncStatus.error,
      entities: entityRows,
    },
    schema,
    alerts,
    score: {
      value: scoreValue,
      label: overallLabelFromScore(scoreValue),
    },
  };
}
