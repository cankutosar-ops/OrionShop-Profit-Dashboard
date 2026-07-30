import type { FailureCategory, VerificationFailure, VerificationOverallResult } from "./types";
import type { ProductionHealthReport } from "@/lib/production-health/types";

export function classifyVerificationFailures(
  report: ProductionHealthReport,
  syncStatus: string,
  syncError: string | null
): VerificationFailure[] {
  const detectedAt = new Date().toISOString();
  const failures: VerificationFailure[] = [];

  if (report.schema.status === "FAIL") {
    for (const miss of report.schema.missing) {
      failures.push({
        category: "schema_mismatch",
        affectedEntity: miss.table,
        reason: `Missing column ${miss.table}.${miss.column}`,
        detectedAt,
        recommendedAction: `Apply migration ${miss.expectedMigration} then re-sync.`,
      });
    }
  }

  for (const row of report.coverage) {
    if (!row.behindApi) continue;
    const category: FailureCategory =
      row.entity === "orders"
        ? "orders_behind_api"
        : row.entity === "sales"
          ? "sales_behind_api"
          : row.entity === "finance"
            ? "finance_behind_api"
            : "inventory_stale";
    failures.push({
      category,
      affectedEntity: row.entity,
      reason: `${row.label} DB latest ${row.databaseLatestDate ?? "(none)"} is ${row.gapDays ?? "?"} day(s) behind expected ${row.expectedLatestApiDate}.`,
      detectedAt,
      recommendedAction:
        row.entity === "inventory"
          ? "Run a full Sync including stock, or investigate deprecated stocks API coverage."
          : `Re-run ${row.label} synchronization for the lagging window and confirm upserts succeed.`,
    });
  }

  const sync = syncStatus.toLowerCase();
  if (sync === "failed") {
    failures.push({
      category: "sync_failed",
      affectedEntity: "sync",
      reason: syncError ?? "Synchronization finished with failed status.",
      detectedAt,
      recommendedAction: "Inspect sync errors, fix credentials/rate limits, then retry sync.",
    });
  } else if (sync === "partial" || sync === "warning") {
    failures.push({
      category: "partial_sync",
      affectedEntity: "sync",
      reason: "Synchronization completed with partial or warning status.",
      detectedAt,
      recommendedAction: "Review entity-level sync errors and re-run affected entities only.",
    });
  }

  for (const alert of report.alerts) {
    if (alert.severity === "healthy") continue;
    const already = failures.some((f) => f.reason.includes(alert.detail.slice(0, 40)));
    if (already) continue;
    if (alert.id.startsWith("coverage-") || alert.id.startsWith("schema-") || alert.id.startsWith("sync-")) {
      continue;
    }
    failures.push({
      category: "other",
      affectedEntity: String(alert.entity ?? "system"),
      reason: `${alert.title}: ${alert.detail}`,
      detectedAt,
      recommendedAction: "Review Production Health alerts and resolve the underlying freshness/sync issue.",
    });
  }

  return failures;
}

export function resolveOverallResult(input: {
  schemaStatus: string;
  healthScore: number;
  failures: VerificationFailure[];
  syncStatus: string;
}): VerificationOverallResult {
  if (input.schemaStatus === "FAIL") return "FAIL";
  if (input.syncStatus.toLowerCase() === "failed") return "FAIL";
  if (input.failures.some((f) => f.category === "schema_mismatch" || f.category === "sync_failed")) {
    return "FAIL";
  }
  if (input.healthScore < 60) return "FAIL";
  if (input.healthScore < 90 || input.failures.length > 0) return "WARNING";
  return "PASS";
}
