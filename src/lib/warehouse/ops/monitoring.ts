/**
 * Sprint 10.4 — Health + metrics + alerts (operational only).
 */

import type { IncrementalSyncEntity } from "@/lib/warehouse/incremental/constants";
import {
  DEFAULT_OPS_THRESHOLDS,
  type OpsThresholdConfig,
} from "@/lib/warehouse/ops/constants";
import type { InMemoryWarehouseOpsStore } from "@/lib/warehouse/ops/memory-store";
import type {
  WarehouseHealthSnapshot,
  WarehouseOpsMetrics,
  WarehouseMonitoringSnapshot,
  WarehouseScheduleConfig,
  WarehouseSyncHistoryRecord,
} from "@/lib/warehouse/ops/types";

export function computeOpsMetrics(
  history: WarehouseSyncHistoryRecord[],
  queueSummary: {
    running: number;
    waiting: number;
    failed: number;
    successful: number;
  }
): WarehouseOpsMetrics {
  const totalSyncs = history.length;
  const successCount = history.filter((h) => h.status === "success").length;
  const failureCount = history.filter((h) => h.status === "failed").length;
  const partialCount = history.filter((h) => h.status === "partial").length;
  const durations = history
    .map((h) => h.durationMs)
    .filter((d): d is number => typeof d === "number" && d >= 0);
  const waits = history
    .map((h) => h.queueWaitMs)
    .filter((d): d is number => typeof d === "number" && d >= 0);

  const rowsProcessed = history.reduce(
    (sum, h) => sum + h.insertedRows + h.updatedRows + h.skippedRows,
    0
  );
  const apiCalls = history.reduce((sum, h) => sum + h.apiCalls, 0);
  const retryCount = history.reduce((sum, h) => sum + h.retryCount, 0);

  return {
    totalSyncs,
    successCount,
    failureCount,
    partialCount,
    successRate: totalSyncs === 0 ? 0 : successCount / totalSyncs,
    averageDurationMs:
      durations.length === 0
        ? 0
        : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    rowsProcessed,
    apiCalls,
    retryCount,
    averageQueueWaitMs:
      waits.length === 0 ? 0 : Math.round(waits.reduce((a, b) => a + b, 0) / waits.length),
    runningJobs: queueSummary.running,
    waitingJobs: queueSummary.waiting,
    failedJobs: queueSummary.failed,
    successfulJobs: queueSummary.successful,
  };
}

export function computeHealth(input: {
  history: WarehouseSyncHistoryRecord[];
  schedules: WarehouseScheduleConfig[];
  openAlertCount: number;
  now?: Date;
  thresholds?: OpsThresholdConfig;
}): WarehouseHealthSnapshot {
  const now = input.now ?? new Date();
  const thresholds = input.thresholds ?? DEFAULT_OPS_THRESHOLDS;
  const history = input.history;

  if (!history.length && !input.schedules.length) {
    return {
      state: "unknown",
      reason: "No sync history or schedule configuration",
      lastSuccessfulSyncAt: null,
      lastFailedSyncAt: null,
      consecutiveFailures: 0,
      openAlerts: input.openAlertCount,
      staleEntities: [],
    };
  }

  const lastSuccess = history.find((h) => h.status === "success" || h.status === "partial");
  const lastFail = history.find((h) => h.status === "failed");

  let consecutiveFailures = 0;
  for (const h of history) {
    if (h.status === "failed") consecutiveFailures += 1;
    else break;
  }

  const staleEntities: IncrementalSyncEntity[] = [];
  for (const schedule of input.schedules.filter((s) => s.enabled)) {
    const entityHistory = history.find(
      (h) =>
        (h.entity === schedule.entity || h.entity == null) &&
        (h.status === "success" || h.status === "partial")
    );
    const lastAt = entityHistory?.finishedAt ?? schedule.lastEnqueuedAt;
    if (!lastAt) {
      staleEntities.push(schedule.entity);
      continue;
    }
    const ageMs = now.getTime() - new Date(lastAt).getTime();
    if (ageMs > schedule.intervalMs * thresholds.staleMultiplier) {
      staleEntities.push(schedule.entity);
    }
  }

  if (consecutiveFailures >= thresholds.consecutiveFailureAlertAt) {
    return {
      state: "failed",
      reason: `${consecutiveFailures} consecutive sync failures`,
      lastSuccessfulSyncAt: lastSuccess?.finishedAt ?? null,
      lastFailedSyncAt: lastFail?.finishedAt ?? lastFail?.startedAt ?? null,
      consecutiveFailures,
      openAlerts: input.openAlertCount,
      staleEntities,
    };
  }

  if (staleEntities.length > 0) {
    return {
      state: "sync_delayed",
      reason: `Stale entities: ${staleEntities.join(", ")}`,
      lastSuccessfulSyncAt: lastSuccess?.finishedAt ?? null,
      lastFailedSyncAt: lastFail?.finishedAt ?? lastFail?.startedAt ?? null,
      consecutiveFailures,
      openAlerts: input.openAlertCount,
      staleEntities,
    };
  }

  if (input.openAlertCount > 0 || consecutiveFailures > 0 || lastFail) {
    return {
      state: "degraded",
      reason:
        input.openAlertCount > 0
          ? `${input.openAlertCount} open operational alert(s)`
          : "Recent failures present",
      lastSuccessfulSyncAt: lastSuccess?.finishedAt ?? null,
      lastFailedSyncAt: lastFail?.finishedAt ?? lastFail?.startedAt ?? null,
      consecutiveFailures,
      openAlerts: input.openAlertCount,
      staleEntities,
    };
  }

  return {
    state: "healthy",
    reason: "Sync pipeline operating within thresholds",
    lastSuccessfulSyncAt: lastSuccess?.finishedAt ?? null,
    lastFailedSyncAt: null,
    consecutiveFailures: 0,
    openAlerts: 0,
    staleEntities: [],
  };
}

export class WarehouseAlertService {
  constructor(
    private readonly store: InMemoryWarehouseOpsStore,
    private readonly thresholds: OpsThresholdConfig = DEFAULT_OPS_THRESHOLDS
  ) {}

  evaluateAndRecord(input: {
    marketplaceType: WarehouseSyncHistoryRecord["marketplaceType"];
    companyId: string;
    marketplaceAccountId: string;
    consecutiveFailures: number;
    waitingJobs: number;
    runningJobStartedAt: string | null;
    staleEntities: IncrementalSyncEntity[];
    now?: Date;
  }): void {
    const now = input.now ?? new Date();
    const open = this.store.listOpenAlerts(input.marketplaceAccountId);

    const hasType = (t: string) => open.some((a) => a.alertType === t);

    if (
      input.consecutiveFailures >= this.thresholds.consecutiveFailureAlertAt &&
      !hasType("consecutive_failures")
    ) {
      this.store.createAlert({
        marketplaceType: input.marketplaceType,
        companyId: input.companyId,
        marketplaceAccountId: input.marketplaceAccountId,
        alertType: "consecutive_failures",
        severity: "critical",
        title: "Consecutive sync failures",
        message: `${input.consecutiveFailures} consecutive warehouse sync failures`,
        meta: { consecutiveFailures: input.consecutiveFailures },
      });
    }

    if (
      input.waitingJobs >= this.thresholds.queueOverflowThreshold &&
      !hasType("queue_overflow")
    ) {
      this.store.createAlert({
        marketplaceType: input.marketplaceType,
        companyId: input.companyId,
        marketplaceAccountId: input.marketplaceAccountId,
        alertType: "queue_overflow",
        severity: "warning",
        title: "Queue overflow",
        message: `Waiting jobs (${input.waitingJobs}) exceeded threshold ${this.thresholds.queueOverflowThreshold}`,
        meta: { waitingJobs: input.waitingJobs },
      });
    }

    if (input.runningJobStartedAt && !hasType("long_running_job")) {
      const age = now.getTime() - new Date(input.runningJobStartedAt).getTime();
      if (age >= this.thresholds.longRunningJobMs) {
        this.store.createAlert({
          marketplaceType: input.marketplaceType,
          companyId: input.companyId,
          marketplaceAccountId: input.marketplaceAccountId,
          alertType: "long_running_job",
          severity: "warning",
          title: "Long running sync job",
          message: `Job running for ${Math.round(age / 1000)}s`,
          meta: { startedAt: input.runningJobStartedAt, ageMs: age },
        });
      }
    }

    if (input.staleEntities.length > 0 && !hasType("stale_data")) {
      this.store.createAlert({
        marketplaceType: input.marketplaceType,
        companyId: input.companyId,
        marketplaceAccountId: input.marketplaceAccountId,
        alertType: "stale_data",
        severity: "warning",
        title: "Stale warehouse data",
        message: `Entities exceeding freshness window: ${input.staleEntities.join(", ")}`,
        meta: { staleEntities: input.staleEntities },
      });
    }
  }
}

export function buildMonitoringSnapshot(
  store: InMemoryWarehouseOpsStore,
  accountId: string,
  options?: { thresholds?: OpsThresholdConfig; now?: Date }
): WarehouseMonitoringSnapshot {
  const jobs = store.listJobs(accountId);
  const history = store.listHistory(accountId, 200);
  const schedules = store.listSchedules(accountId);
  const openAlerts = store.listOpenAlerts(accountId);

  const runningJobs = jobs.filter((j) => j.status === "running");
  const waitingJobs = jobs.filter((j) => j.status === "waiting");
  const failedJobs = jobs.filter((j) => j.status === "failed").slice(-20);
  const successfulJobsRecent = jobs.filter((j) => j.status === "success").slice(-20);

  const metrics = computeOpsMetrics(history, {
    running: runningJobs.length,
    waiting: waitingJobs.length,
    failed: jobs.filter((j) => j.status === "failed").length,
    successful: jobs.filter((j) => j.status === "success").length,
  });

  const health = computeHealth({
    history,
    schedules,
    openAlertCount: openAlerts.length,
    now: options?.now,
    thresholds: options?.thresholds,
  });

  const current = runningJobs[0] ?? null;

  return {
    runningJobs,
    waitingJobs,
    failedJobs,
    successfulJobsRecent,
    averageDurationMs: metrics.averageDurationMs,
    lastSuccessfulSyncAt: health.lastSuccessfulSyncAt,
    lastFailedSyncAt: health.lastFailedSyncAt,
    currentEntity: (current?.meta?.currentEntity as string | undefined) ?? current?.entities[0] ?? null,
    currentProgress: (current?.meta?.progress as Record<string, unknown> | undefined) ?? null,
    health,
    metrics,
  };
}
