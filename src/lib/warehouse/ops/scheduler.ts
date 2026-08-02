/**
 * Sprint 10.4 — Scheduler: enqueue due entity syncs from configurable intervals.
 * No hardcoded timing in execution path — reads ScheduleConfigStore only.
 */

import type { WarehouseScope } from "@/lib/warehouse/types";
import { listSchedulableEntities } from "@/lib/warehouse/ops/constants";
import type { InMemoryWarehouseOpsStore } from "@/lib/warehouse/ops/memory-store";
import { WarehouseSyncQueue } from "@/lib/warehouse/ops/queue";
import type { WarehouseQueueJob, WarehouseScheduleConfig } from "@/lib/warehouse/ops/types";
import type { IncrementalSyncEntity } from "@/lib/warehouse/incremental/constants";

export type SchedulerTickResult = {
  dueEntities: IncrementalSyncEntity[];
  enqueued: WarehouseQueueJob[];
  deduped: number;
  schedules: WarehouseScheduleConfig[];
};

export class WarehouseScheduler {
  constructor(
    private readonly store: InMemoryWarehouseOpsStore,
    private readonly queue: WarehouseSyncQueue
  ) {}

  /**
   * Evaluate schedules for an account and enqueue due work.
   * Groups all currently-due entities into one incremental job (FIFO, deduped).
   */
  tick(scope: WarehouseScope, now = new Date()): SchedulerTickResult {
    const schedules = this.store.ensureDefaultSchedules(scope);
    const dueEntities: IncrementalSyncEntity[] = [];

    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      const last = schedule.lastEnqueuedAt
        ? new Date(schedule.lastEnqueuedAt).getTime()
        : 0;
      const dueAt = last + schedule.intervalMs;
      if (now.getTime() >= dueAt) {
        dueEntities.push(schedule.entity);
      }
    }

    const enqueued: WarehouseQueueJob[] = [];
    let deduped = 0;

    if (dueEntities.length) {
      const result = this.queue.enqueue({
        scope,
        jobType: "incremental",
        entities: dueEntities,
        triggerSource: "scheduled",
        priority: 100,
        meta: { dueEntities, tickAt: now.toISOString() },
      });
      if (result.deduped) deduped += 1;
      else {
        enqueued.push(result.job);
        for (const entity of dueEntities) {
          this.store.markScheduleEnqueued(
            scope.marketplaceAccountId,
            entity,
            now.toISOString()
          );
        }
      }
    }

    return { dueEntities, enqueued, deduped, schedules };
  }

  /** Force-mark all entities as due on next tick (admin/test helper). */
  markAllDue(scope: WarehouseScope, pastIso: string): void {
    this.store.ensureDefaultSchedules(scope);
    for (const entity of listSchedulableEntities()) {
      this.store.markScheduleEnqueued(scope.marketplaceAccountId, entity, pastIso);
      // lastEnqueued far in the past so tick considers due — set via interval math:
      // use epoch so due immediately
      const key = this.store.scheduleKey(scope.marketplaceAccountId, entity);
      const row = this.store.schedules.get(key);
      if (row) {
        this.store.schedules.set(key, {
          ...row,
          lastEnqueuedAt: pastIso,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  setIntervalMs(
    accountId: string,
    entity: IncrementalSyncEntity,
    intervalMs: number
  ): WarehouseScheduleConfig {
    this.store.ensureDefaultSchedules({
      marketplaceType: "wildberries",
      companyId: "0",
      marketplaceAccountId: accountId,
    });
    return this.store.updateScheduleInterval(accountId, entity, intervalMs);
  }

  /** Pause / resume a schedule without changing interval (Sprint 11.3). */
  setEnabled(
    accountId: string,
    entity: IncrementalSyncEntity,
    enabled: boolean
  ): WarehouseScheduleConfig {
    this.store.ensureDefaultSchedules({
      marketplaceType: "wildberries",
      companyId: "0",
      marketplaceAccountId: accountId,
    });
    return this.store.updateScheduleEnabled(accountId, entity, enabled);
  }
}
