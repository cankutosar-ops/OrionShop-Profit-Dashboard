import { syncLog } from "@/lib/wildberries/sync-log";
import { toDateString } from "@/lib/wildberries/mappers";
import { WbApiClient } from "@/lib/wildberries/api-client";
import {
  classifyVerificationFailures,
  resolveOverallResult,
} from "@/lib/sync-verification-audit/classify";
import type {
  EntityVerificationBlock,
  PostSyncVerificationInput,
  SyncVerificationReportRow,
  VerificationSnapshot,
} from "@/lib/sync-verification-audit/types";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import { getProductionHealthReport } from "@/services/production-health-service";
import { insertVerificationReport } from "@/services/sync-verification-report-repository";
import type { HealthLevel } from "@/lib/production-health/types";

function daysBetween(latest: string | null, expected: string | null): number | null {
  if (!latest || !expected) return null;
  const a = Date.parse(`${latest}T00:00:00.000Z`);
  const b = Date.parse(`${expected}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

async function probeLatestApiDates(marketplaceAccountId: string, expectedAsOf: string) {
  const fallback = {
    orders: expectedAsOf,
    sales: expectedAsOf,
    finance: expectedAsOf,
    inventory: null as string | null,
  };

  try {
    const account = await getMarketplaceAccountForSync(marketplaceAccountId);
    const api = new WbApiClient(account.apiKey);
    const from = addDays(expectedAsOf, -7);

    // Lightweight lookback only — avoid full-history pulls during verification.
    const [orders, sales] = await Promise.all([
      api.fetchOrders(`${from}T00:00:00`).catch(() => []),
      api.fetchSales(`${from}T00:00:00`).catch(() => []),
    ]);

    const orderDates = orders.map((o) => toDateString(o.date)).sort();
    const saleDates = sales.map((s) => toDateString(s.date)).sort();

    // Finance API detail is expensive; prefer account health marker from last finance sync.
    const financeLatest =
      (account as { finance_latest_operation_date?: string | null }).finance_latest_operation_date ??
      null;

    return {
      orders: orderDates.at(-1) ?? fallback.orders,
      sales: saleDates.at(-1) ?? fallback.sales,
      finance: financeLatest ? toDateString(financeLatest) : fallback.finance,
      inventory: null,
    };
  } catch (err) {
    syncLog("verification-audit", "API probe skipped", {
      message: err instanceof Error ? err.message : "probe failed",
    });
    return fallback;
  }
}

function entityBlock(
  entity: EntityVerificationBlock["entity"],
  label: string,
  latestApiDate: string | null,
  latestDbDate: string | null,
  status: HealthLevel,
  recordCount: number
): EntityVerificationBlock {
  const gapDays = daysBetween(latestDbDate, latestApiDate);
  return {
    entity,
    label,
    latestApiDate,
    latestDbDate,
    gapDays,
    coverageStatus: status,
    status,
    recordCount,
  };
}

/**
 * Read-only verification engine. Never mutates marketplace business tables.
 * Persists an immutable snapshot to sync_verification_reports.
 */
export async function runPostSyncVerification(
  input: PostSyncVerificationInput
): Promise<SyncVerificationReportRow | null> {
  const health = await getProductionHealthReport(input.marketplaceAccountId);
  const apiLatest = await probeLatestApiDates(input.marketplaceAccountId, health.expectedAsOf);

  const byEntity = Object.fromEntries(health.freshness.map((f) => [f.entity, f]));

  const orders = entityBlock(
    "orders",
    "Orders",
    apiLatest.orders,
    byEntity.orders?.latestDbDate ?? null,
    byEntity.orders?.status ?? "warning",
    byEntity.orders?.recordCount ?? 0
  );
  const sales = entityBlock(
    "sales",
    "Sales",
    apiLatest.sales,
    byEntity.sales?.latestDbDate ?? null,
    byEntity.sales?.status ?? "warning",
    byEntity.sales?.recordCount ?? 0
  );
  const finance = entityBlock(
    "finance",
    "Finance",
    apiLatest.finance,
    byEntity.finance?.latestDbDate ?? null,
    byEntity.finance?.status ?? "warning",
    byEntity.finance?.recordCount ?? 0
  );
  const inventory = entityBlock(
    "inventory",
    "Inventory",
    apiLatest.inventory,
    byEntity.inventory?.latestDbDate ?? null,
    byEntity.inventory?.status ?? "warning",
    byEntity.inventory?.recordCount ?? 0
  );

  const results = input.syncResults ?? [];
  const rowsInserted = results.reduce((s, r) => s + (r.recordsInserted ?? 0), 0);
  const rowsUpdated = results.reduce((s, r) => s + (r.recordsUpdated ?? 0), 0);
  const errors = results.flatMap((r) => r.errors ?? []);
  if (input.syncError) errors.push(input.syncError);

  const synchronization = {
    durationMs: input.syncTiming?.totalMs ?? null,
    rowsInserted,
    rowsUpdated,
    errors,
    warnings: [],
    finalStatus: input.syncStatus,
  };

  const failures = classifyVerificationFailures(health, input.syncStatus, input.syncError ?? null);
  const overallResult = resolveOverallResult({
    schemaStatus: health.schema.status,
    healthScore: health.score.value,
    failures,
    syncStatus: input.syncStatus,
  });

  const snapshot: VerificationSnapshot = {
    version: 1,
    verifiedAt: new Date().toISOString(),
    marketplaceAccountId: input.marketplaceAccountId,
    healthScore: health.score.value,
    schemaStatus: health.schema.status,
    overallResult,
    orders,
    sales,
    finance,
    inventory,
    synchronization,
    operationalAlerts: health.alerts,
    failures,
    productionHealth: {
      ...health,
      coverage: health.coverage.map((c) => {
        const apiDate =
          c.entity === "orders"
            ? apiLatest.orders
            : c.entity === "sales"
              ? apiLatest.sales
              : c.entity === "finance"
                ? apiLatest.finance
                : apiLatest.inventory ?? c.expectedLatestApiDate;
        return {
          ...c,
          expectedLatestApiDate: apiDate ?? c.expectedLatestApiDate,
          gapDays: daysBetween(c.databaseLatestDate, apiDate ?? c.expectedLatestApiDate),
          behindApi:
            daysBetween(c.databaseLatestDate, apiDate ?? c.expectedLatestApiDate) != null
              ? (daysBetween(c.databaseLatestDate, apiDate ?? c.expectedLatestApiDate) as number) >
                0 && c.status !== "healthy"
              : c.behindApi,
        };
      }),
    },
  };

  const row = await insertVerificationReport({
    marketplaceAccountId: input.marketplaceAccountId,
    expectedAsOf: health.expectedAsOf,
    healthScore: health.score.value,
    overallResult,
    schemaStatus: health.schema.status,
    ordersStatus: orders.status,
    salesStatus: sales.status,
    financeStatus: finance.status,
    inventoryStatus: inventory.status,
    syncStatus: input.syncStatus,
    syncRequestId: input.syncRequestId ?? null,
    syncDurationMs: synchronization.durationMs,
    snapshot,
    failures,
  });

  syncLog("verification-audit", "SNAPSHOT SAVED", {
    id: row.id,
    overallResult,
    healthScore: row.health_score,
  });

  return row;
}

/**
 * Fire-and-forget wrapper — never throws into the sync pipeline.
 */
export function schedulePostSyncVerification(input: PostSyncVerificationInput): void {
  void runPostSyncVerification(input).catch((err) => {
    syncLog("verification-audit", "FAILED (non-fatal)", {
      message: err instanceof Error ? err.message : "verification failed",
      marketplaceAccountId: input.marketplaceAccountId,
    });
  });
}
