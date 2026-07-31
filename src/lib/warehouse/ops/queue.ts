/**
 * Sprint 10.4 — Sync queue: one active sync per account, FIFO, dedupe.
 */

import type { IncrementalSyncEntity } from "@/lib/warehouse/incremental/constants";
import type { WarehouseScope, WarehouseTriggerSource } from "@/lib/warehouse/types";
import { dedupeKeyForJob, DEFAULT_RETRY_POLICY } from "@/lib/warehouse/ops/constants";
import type { InMemoryWarehouseOpsStore } from "@/lib/warehouse/ops/memory-store";
import type {
  WarehouseJobType,
  WarehouseQueueJob,
} from "@/lib/warehouse/ops/types";

export type EnqueueSyncJobInput = {
  scope: WarehouseScope;
  jobType: WarehouseJobType;
  entities: IncrementalSyncEntity[];
  triggerSource: WarehouseTriggerSource | "api";
  priority?: number;
  availableAt?: string;
  maxAttempts?: number;
  meta?: Record<string, unknown>;
};

export type EnqueueResult = {
  job: WarehouseQueueJob;
  deduped: boolean;
};

export class WarehouseSyncQueue {
  constructor(private readonly store: InMemoryWarehouseOpsStore) {}

  /**
   * Enqueue a job. Duplicate waiting/running dedupe keys are ignored.
   * Also enforces at most one waiting+running logical stream via dedupe of full-account jobs.
   */
  enqueue(input: EnqueueSyncJobInput): EnqueueResult {
    const dedupeKey = dedupeKeyForJob(
      input.jobType,
      input.entities,
      String(input.triggerSource)
    );

    const duplicate = this.store.findDuplicate(input.scope.marketplaceAccountId, dedupeKey);
    if (duplicate) {
      return {
        job: this.store.updateJob(duplicate.id, {
          status: duplicate.status,
          meta: { ...duplicate.meta, ignoredDuplicateAt: new Date().toISOString() },
        }),
        deduped: true,
      };
    }

    // Account-level: if anything is already waiting/running with same jobType for all entities, skip
    const active = this.store.getActiveJob(input.scope.marketplaceAccountId);
    if (
      active &&
      active.jobType === input.jobType &&
      input.jobType === "incremental" &&
      input.entities.length >= 6
    ) {
      return { job: active, deduped: true };
    }

    const job = this.store.enqueue({
      marketplaceType: input.scope.marketplaceType,
      companyId: input.scope.companyId,
      marketplaceAccountId: input.scope.marketplaceAccountId,
      jobType: input.jobType,
      entities: [...input.entities],
      triggerSource: input.triggerSource,
      status: "waiting",
      priority: input.priority ?? 100,
      dedupeKey,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
      availableAt: input.availableAt ?? new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      sessionId: null,
      errorMessage: null,
      meta: input.meta ?? {},
    });

    return { job, deduped: false };
  }

  claimNext(now = new Date()): WarehouseQueueJob | null {
    const next = this.store.nextWaitingJob(now);
    if (!next) return null;
    return this.store.updateJob(next.id, {
      status: "running",
      startedAt: now.toISOString(),
      attempts: next.attempts + 1,
    });
  }

  complete(
    jobId: string,
    patch: {
      status: "success" | "failed" | "cancelled";
      sessionId?: string | null;
      errorMessage?: string | null;
      meta?: Record<string, unknown>;
    }
  ): WarehouseQueueJob {
    return this.store.updateJob(jobId, {
      status: patch.status,
      finishedAt: new Date().toISOString(),
      sessionId: patch.sessionId ?? null,
      errorMessage: patch.errorMessage ?? null,
      meta: patch.meta,
    });
  }

  cancelWaiting(accountId: string, jobId?: string): number {
    return this.store.cancelWaiting(accountId, jobId);
  }

  list(accountId?: string): WarehouseQueueJob[] {
    return this.store.listJobs(accountId);
  }
}
