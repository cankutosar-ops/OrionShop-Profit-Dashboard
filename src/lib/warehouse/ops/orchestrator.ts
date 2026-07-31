/**
 * Sprint 10.4 — Ops orchestrator: scheduler → queue → incremental/retry → history → alerts.
 * Marketplace-independent; sync execution injected via runner callback.
 */

import type { IncrementalSyncEntity } from "@/lib/warehouse/incremental/constants";
import type { IncrementalSyncResult } from "@/lib/warehouse/incremental/engine";
import type { WarehouseScope } from "@/lib/warehouse/types";
import {
  DEFAULT_OPS_THRESHOLDS,
  DEFAULT_RETRY_POLICY,
  type OpsThresholdConfig,
  type RetryPolicyConfig,
} from "@/lib/warehouse/ops/constants";
import { InMemoryWarehouseOpsStore } from "@/lib/warehouse/ops/memory-store";
import {
  WarehouseAlertService,
  buildMonitoringSnapshot,
  computeHealth,
} from "@/lib/warehouse/ops/monitoring";
import { WarehouseSyncQueue } from "@/lib/warehouse/ops/queue";
import { WarehouseRetryEngine } from "@/lib/warehouse/ops/retry";
import { WarehouseScheduler } from "@/lib/warehouse/ops/scheduler";
import type {
  WarehouseMonitoringSnapshot,
  WarehouseQueueJob,
  WarehouseSyncHistoryRecord,
} from "@/lib/warehouse/ops/types";

export type IncrementalRunner = (input: {
  scope: WarehouseScope;
  entities: IncrementalSyncEntity[];
  trigger: "manual" | "scheduled" | "api" | "recover";
}) => Promise<IncrementalSyncResult>;

export type WarehouseOpsOrchestratorOptions = {
  store?: InMemoryWarehouseOpsStore;
  runner?: IncrementalRunner;
  retryPolicy?: RetryPolicyConfig;
  thresholds?: OpsThresholdConfig;
};

export type ProcessQueueResult = {
  processed: WarehouseQueueJob | null;
  history: WarehouseSyncHistoryRecord | null;
  syncResult: IncrementalSyncResult | null;
  skipped: boolean;
  reason?: string;
};

function mapTrigger(
  source: WarehouseQueueJob["triggerSource"]
): "manual" | "scheduled" | "api" | "recover" {
  if (source === "scheduled") return "scheduled";
  if (source === "recover") return "recover";
  if (source === "api") return "api";
  return "manual";
}

export class WarehouseOpsOrchestrator {
  readonly store: InMemoryWarehouseOpsStore;
  readonly queue: WarehouseSyncQueue;
  readonly scheduler: WarehouseScheduler;
  readonly retry: WarehouseRetryEngine;
  readonly alerts: WarehouseAlertService;
  private readonly runner: IncrementalRunner | null;
  private readonly thresholds: OpsThresholdConfig;

  constructor(options: WarehouseOpsOrchestratorOptions = {}) {
    this.store = options.store ?? new InMemoryWarehouseOpsStore();
    this.queue = new WarehouseSyncQueue(this.store);
    this.scheduler = new WarehouseScheduler(this.store, this.queue);
    this.retry = new WarehouseRetryEngine(
      this.store,
      options.retryPolicy ?? DEFAULT_RETRY_POLICY
    );
    this.thresholds = options.thresholds ?? DEFAULT_OPS_THRESHOLDS;
    this.alerts = new WarehouseAlertService(this.store, this.thresholds);
    this.runner = options.runner ?? null;
  }

  /**
   * Scheduler tick + enqueue due retries, then optionally process one queue job.
   */
  async runCycle(
    scope: WarehouseScope,
    options?: { processQueue?: boolean; now?: Date }
  ): Promise<{
    tick: ReturnType<WarehouseScheduler["tick"]>;
    retryEnqueued: number;
    process: ProcessQueueResult | null;
    monitoring: WarehouseMonitoringSnapshot;
  }> {
    const now = options?.now ?? new Date();
    this.store.ensureDefaultSchedules(scope);

    const tick = this.scheduler.tick(scope, now);

    let retryEnqueued = 0;
    const dueRetries = this.retry.dueEntities(scope.marketplaceAccountId, now);
    if (dueRetries.length) {
      const result = this.queue.enqueue({
        scope,
        jobType: "retry",
        entities: dueRetries,
        triggerSource: "recover",
        priority: 50,
        meta: { retryEntities: dueRetries },
      });
      if (!result.deduped) retryEnqueued = 1;
    }

    let process: ProcessQueueResult | null = null;
    if (options?.processQueue !== false) {
      process = await this.processNext(scope, now);
    }

    this.refreshAlerts(scope, now);

    return {
      tick,
      retryEnqueued,
      process,
      monitoring: buildMonitoringSnapshot(this.store, scope.marketplaceAccountId, {
        thresholds: this.thresholds,
        now,
      }),
    };
  }

  async processNext(scope: WarehouseScope, now = new Date()): Promise<ProcessQueueResult> {
    if (!this.runner) {
      return {
        processed: null,
        history: null,
        syncResult: null,
        skipped: true,
        reason: "No incremental runner configured",
      };
    }

    const job = this.queue.claimNext(now);
    if (!job) {
      return {
        processed: null,
        history: null,
        syncResult: null,
        skipped: true,
        reason: "Queue empty or account busy",
      };
    }

    // Only process jobs for this scope account (multi-account safety)
    if (job.marketplaceAccountId !== String(scope.marketplaceAccountId)) {
      // put back conceptually — mark waiting again
      this.store.updateJob(job.id, {
        status: "waiting",
        startedAt: null,
        attempts: Math.max(0, job.attempts - 1),
      });
      return {
        processed: null,
        history: null,
        syncResult: null,
        skipped: true,
        reason: "Next job belongs to another account",
      };
    }

    const startedAt = now;
    const queueWaitMs = Math.max(
      0,
      startedAt.getTime() - new Date(job.createdAt).getTime()
    );

    let syncResult: IncrementalSyncResult;
    try {
      syncResult = await this.runner({
        scope,
        entities: job.entities,
        trigger: mapTrigger(job.triggerSource),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync runner failed";
      const finished = this.queue.complete(job.id, {
        status: "failed",
        errorMessage: message,
      });
      const history = this.store.appendHistory({
        marketplaceType: scope.marketplaceType,
        companyId: scope.companyId,
        marketplaceAccountId: scope.marketplaceAccountId,
        queueJobId: job.id,
        sessionId: null,
        triggerSource: String(job.triggerSource),
        entity: job.entities[0] ?? null,
        status: "failed",
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        insertedRows: 0,
        updatedRows: 0,
        failedRows: job.entities.length,
        skippedRows: 0,
        apiCalls: 0,
        retryCount: job.attempts,
        queueWaitMs,
        errorMessage: message,
        meta: { jobType: job.jobType, entities: job.entities },
      });
      this.retry.registerFailures(
        scope.marketplaceAccountId,
        job.entities.map((entity) => ({ entity, error: message })),
        new Date()
      );
      this.refreshAlerts(scope, new Date());
      return { processed: finished, history, syncResult: null, skipped: false };
    }

    const failedEntities = syncResult.entityResults
      .filter((r) => r.status === "failed")
      .map((r) => ({ entity: r.entity, error: r.errorMessage }));
    const succeededEntities = syncResult.entityResults
      .filter((r) => r.status === "success")
      .map((r) => r.entity);
    const pausedEntities = syncResult.entityResults
      .filter((r) => r.status === "paused")
      .map((r) => r.entity);

    this.retry.clearSuccesses(scope.marketplaceAccountId, succeededEntities, new Date());
    if (failedEntities.length) {
      this.retry.registerFailures(scope.marketplaceAccountId, failedEntities, new Date());
    }

    const status =
      syncResult.status === "blocked"
        ? "blocked"
        : syncResult.status === "success"
          ? "success"
          : syncResult.status === "partial"
            ? "partial"
            : "failed";

    const finished = this.queue.complete(job.id, {
      status: status === "success" || status === "partial" ? "success" : "failed",
      sessionId: syncResult.sessionId,
      errorMessage: syncResult.errorMessage,
      meta: {
        ...job.meta,
        entityResults: syncResult.entityResults,
        pausedEntities,
      },
    });

    const inserted = syncResult.entityResults.reduce((s, r) => s + r.inserted, 0);
    const updated = syncResult.entityResults.reduce((s, r) => s + r.updated, 0);
    const skipped = syncResult.entityResults.reduce((s, r) => s + r.skipped, 0);
    const failedRows = failedEntities.length;

    const history = this.store.appendHistory({
      marketplaceType: scope.marketplaceType,
      companyId: scope.companyId,
      marketplaceAccountId: scope.marketplaceAccountId,
      queueJobId: job.id,
      sessionId: syncResult.sessionId,
      triggerSource: String(job.triggerSource),
      entity: job.entities[0] ?? null,
      status,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      insertedRows: inserted,
      updatedRows: updated,
      failedRows,
      skippedRows: skipped,
      apiCalls: Number(syncResult.statistics.pages ?? syncResult.entityResults.length),
      retryCount: job.jobType === "retry" ? job.attempts : 0,
      queueWaitMs,
      errorMessage: syncResult.errorMessage,
      meta: {
        jobType: job.jobType,
        entities: job.entities,
        entityResults: syncResult.entityResults,
      },
    });

    this.refreshAlerts(scope, new Date());

    return { processed: finished, history, syncResult, skipped: false };
  }

  enqueueManual(
    scope: WarehouseScope,
    entities?: IncrementalSyncEntity[]
  ): ReturnType<WarehouseSyncQueue["enqueue"]> {
    this.store.ensureDefaultSchedules(scope);
    return this.queue.enqueue({
      scope,
      jobType: "manual",
      entities: entities ?? (this.store.listSchedules(scope.marketplaceAccountId).map((s) => s.entity) as IncrementalSyncEntity[]),
      triggerSource: "manual",
      priority: 10,
    });
  }

  getMonitoring(accountId: string, now = new Date()): WarehouseMonitoringSnapshot {
    return buildMonitoringSnapshot(this.store, accountId, {
      thresholds: this.thresholds,
      now,
    });
  }

  getHealth(accountId: string, now = new Date()) {
    return computeHealth({
      history: this.store.listHistory(accountId, 200),
      schedules: this.store.listSchedules(accountId),
      openAlertCount: this.store.listOpenAlerts(accountId).length,
      now,
      thresholds: this.thresholds,
    });
  }

  private refreshAlerts(scope: WarehouseScope, now: Date): void {
    const monitoring = buildMonitoringSnapshot(this.store, scope.marketplaceAccountId, {
      thresholds: this.thresholds,
      now,
    });
    const running = monitoring.runningJobs[0] ?? null;
    this.alerts.evaluateAndRecord({
      marketplaceType: scope.marketplaceType,
      companyId: scope.companyId,
      marketplaceAccountId: scope.marketplaceAccountId,
      consecutiveFailures: monitoring.health.consecutiveFailures,
      waitingJobs: monitoring.waitingJobs.length,
      runningJobStartedAt: running?.startedAt ?? null,
      staleEntities: monitoring.health.staleEntities,
      now,
    });
  }
}
