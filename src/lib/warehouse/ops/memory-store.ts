/**
 * Sprint 10.4 — In-memory operational stores (verify + single-process fallback).
 */

import type { IncrementalSyncEntity } from "@/lib/warehouse/incremental/constants";
import type { WarehouseScope } from "@/lib/warehouse/types";
import {
  DEFAULT_SCHEDULE_INTERVALS_MS,
  DEFAULT_RETRY_POLICY,
  listSchedulableEntities,
} from "@/lib/warehouse/ops/constants";
import type {
  WarehouseOpsAlert,
  WarehouseQueueJob,
  WarehouseRetryState,
  WarehouseScheduleConfig,
  WarehouseSyncHistoryRecord,
} from "@/lib/warehouse/ops/types";

function nowIso(): string {
  return new Date().toISOString();
}

export class InMemoryWarehouseOpsStore {
  readonly schedules = new Map<string, WarehouseScheduleConfig>();
  readonly queue: WarehouseQueueJob[] = [];
  readonly history: WarehouseSyncHistoryRecord[] = [];
  readonly alerts: WarehouseOpsAlert[] = [];
  readonly retries = new Map<string, WarehouseRetryState>();
  private seq = 1;

  scheduleKey(accountId: string, entity: string): string {
    return `${accountId}|${entity}`;
  }

  retryKey(accountId: string, entity: string): string {
    return `${accountId}|${entity}`;
  }

  ensureDefaultSchedules(scope: WarehouseScope): WarehouseScheduleConfig[] {
    const stamp = nowIso();
    const out: WarehouseScheduleConfig[] = [];
    for (const entity of listSchedulableEntities()) {
      const key = this.scheduleKey(scope.marketplaceAccountId, entity);
      let row = this.schedules.get(key);
      if (!row) {
        row = {
          id: String(this.seq++),
          marketplaceType: scope.marketplaceType,
          companyId: scope.companyId,
          marketplaceAccountId: scope.marketplaceAccountId,
          entity,
          intervalMs: DEFAULT_SCHEDULE_INTERVALS_MS[entity],
          enabled: true,
          lastEnqueuedAt: null,
          meta: { source: "default" },
          createdAt: stamp,
          updatedAt: stamp,
        };
        this.schedules.set(key, row);
      }
      out.push(row);
    }
    return out;
  }

  updateScheduleInterval(
    accountId: string,
    entity: IncrementalSyncEntity,
    intervalMs: number
  ): WarehouseScheduleConfig {
    if (intervalMs <= 0) throw new Error("intervalMs must be > 0");
    const key = this.scheduleKey(accountId, entity);
    const existing = this.schedules.get(key);
    if (!existing) throw new Error(`Schedule not found for ${entity}`);
    const next = { ...existing, intervalMs, updatedAt: nowIso(), meta: { ...existing.meta, source: "override" } };
    this.schedules.set(key, next);
    return next;
  }

  listSchedules(accountId: string): WarehouseScheduleConfig[] {
    return [...this.schedules.values()].filter(
      (s) => s.marketplaceAccountId === String(accountId)
    );
  }

  markScheduleEnqueued(accountId: string, entity: IncrementalSyncEntity, at: string): void {
    const key = this.scheduleKey(accountId, entity);
    const row = this.schedules.get(key);
    if (!row) return;
    this.schedules.set(key, { ...row, lastEnqueuedAt: at, updatedAt: nowIso() });
  }

  getActiveJob(accountId: string): WarehouseQueueJob | null {
    return (
      this.queue.find(
        (j) =>
          j.marketplaceAccountId === String(accountId) &&
          (j.status === "waiting" || j.status === "running")
      ) ?? null
    );
  }

  findDuplicate(
    accountId: string,
    dedupeKey: string
  ): WarehouseQueueJob | null {
    return (
      this.queue.find(
        (j) =>
          j.marketplaceAccountId === String(accountId) &&
          j.dedupeKey === dedupeKey &&
          (j.status === "waiting" || j.status === "running")
      ) ?? null
    );
  }

  enqueue(job: Omit<WarehouseQueueJob, "id" | "createdAt" | "updatedAt">): WarehouseQueueJob {
    const stamp = nowIso();
    const row: WarehouseQueueJob = {
      ...job,
      id: crypto.randomUUID(),
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.queue.push(row);
    return row;
  }

  updateJob(id: string, patch: Partial<WarehouseQueueJob>): WarehouseQueueJob {
    const idx = this.queue.findIndex((j) => j.id === id);
    if (idx < 0) throw new Error(`Queue job not found: ${id}`);
    const next = { ...this.queue[idx], ...patch, updatedAt: nowIso() };
    this.queue[idx] = next;
    return next;
  }

  listJobs(accountId?: string): WarehouseQueueJob[] {
    const rows = accountId
      ? this.queue.filter((j) => j.marketplaceAccountId === String(accountId))
      : [...this.queue];
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  nextWaitingJob(now = new Date()): WarehouseQueueJob | null {
    const nowIsoStr = now.toISOString();
    const waiting = this.queue
      .filter((j) => j.status === "waiting" && j.availableAt <= nowIsoStr)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.createdAt.localeCompare(b.createdAt);
      });

    for (const job of waiting) {
      const running = this.queue.some(
        (j) =>
          j.marketplaceAccountId === job.marketplaceAccountId &&
          j.status === "running"
      );
      if (!running) return job;
    }
    return null;
  }

  cancelWaiting(accountId: string, jobId?: string): number {
    let count = 0;
    for (const job of this.queue) {
      if (job.marketplaceAccountId !== String(accountId)) continue;
      if (job.status !== "waiting") continue;
      if (jobId && job.id !== jobId) continue;
      job.status = "cancelled";
      job.finishedAt = nowIso();
      job.updatedAt = nowIso();
      count += 1;
    }
    return count;
  }

  appendHistory(
    input: Omit<WarehouseSyncHistoryRecord, "id" | "createdAt">
  ): WarehouseSyncHistoryRecord {
    const row: WarehouseSyncHistoryRecord = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: nowIso(),
    };
    this.history.unshift(row);
    return row;
  }

  listHistory(accountId: string, limit = 50): WarehouseSyncHistoryRecord[] {
    return this.history
      .filter((h) => h.marketplaceAccountId === String(accountId))
      .slice(0, limit);
  }

  createAlert(
    input: Omit<WarehouseOpsAlert, "id" | "createdAt" | "resolvedAt" | "status"> & {
      status?: WarehouseOpsAlert["status"];
    }
  ): WarehouseOpsAlert {
    const row: WarehouseOpsAlert = {
      ...input,
      id: crypto.randomUUID(),
      status: input.status ?? "open",
      createdAt: nowIso(),
      resolvedAt: null,
    };
    this.alerts.unshift(row);
    return row;
  }

  listOpenAlerts(accountId: string): WarehouseOpsAlert[] {
    return this.alerts.filter(
      (a) => a.marketplaceAccountId === String(accountId) && a.status === "open"
    );
  }

  getRetry(accountId: string, entity: IncrementalSyncEntity): WarehouseRetryState | null {
    return this.retries.get(this.retryKey(accountId, entity)) ?? null;
  }

  upsertRetry(state: WarehouseRetryState): WarehouseRetryState {
    this.retries.set(this.retryKey(state.marketplaceAccountId, state.entity), state);
    return state;
  }

  listRetries(accountId: string): WarehouseRetryState[] {
    return [...this.retries.values()].filter(
      (r) => r.marketplaceAccountId === String(accountId)
    );
  }
}
