/**
 * Sprint 10.4 — Administration readiness facade (no Admin UI).
 * Exposes warehouse / sync / queue / job / history / health status services.
 */

import type { WarehouseScope } from "@/lib/warehouse/types";
import type { WarehouseOpsOrchestrator } from "@/lib/warehouse/ops/orchestrator";
import type {
  WarehouseHealthSnapshot,
  WarehouseMonitoringSnapshot,
  WarehouseOpsAlert,
  WarehouseOpsMetrics,
  WarehouseQueueJob,
  WarehouseScheduleConfig,
  WarehouseSyncHistoryRecord,
} from "@/lib/warehouse/ops/types";

export type WarehouseAdminStatusBundle = {
  warehouseStatus: {
    marketplaceAccountId: string;
    health: WarehouseHealthSnapshot;
    schedules: WarehouseScheduleConfig[];
  };
  syncStatus: {
    lastSuccessfulSyncAt: string | null;
    lastFailedSyncAt: string | null;
    currentEntity: string | null;
    currentProgress: Record<string, unknown> | null;
  };
  queueStatus: {
    waiting: WarehouseQueueJob[];
    running: WarehouseQueueJob[];
    cancelledCapable: true;
  };
  jobStatus: {
    recentFailed: WarehouseQueueJob[];
    recentSuccessful: WarehouseQueueJob[];
  };
  history: WarehouseSyncHistoryRecord[];
  health: WarehouseHealthSnapshot;
  metrics: WarehouseOpsMetrics;
  alerts: WarehouseOpsAlert[];
  monitoring: WarehouseMonitoringSnapshot;
};

export class WarehouseAdminReadinessService {
  constructor(private readonly ops: WarehouseOpsOrchestrator) {}

  getWarehouseStatus(scope: WarehouseScope): WarehouseAdminStatusBundle["warehouseStatus"] {
    this.ops.store.ensureDefaultSchedules(scope);
    return {
      marketplaceAccountId: scope.marketplaceAccountId,
      health: this.ops.getHealth(scope.marketplaceAccountId),
      schedules: this.ops.store.listSchedules(scope.marketplaceAccountId),
    };
  }

  getSyncStatus(accountId: string): WarehouseAdminStatusBundle["syncStatus"] {
    const monitoring = this.ops.getMonitoring(accountId);
    return {
      lastSuccessfulSyncAt: monitoring.lastSuccessfulSyncAt,
      lastFailedSyncAt: monitoring.lastFailedSyncAt,
      currentEntity: monitoring.currentEntity,
      currentProgress: monitoring.currentProgress,
    };
  }

  getQueueStatus(accountId: string): WarehouseAdminStatusBundle["queueStatus"] {
    const jobs = this.ops.queue.list(accountId);
    return {
      waiting: jobs.filter((j) => j.status === "waiting"),
      running: jobs.filter((j) => j.status === "running"),
      cancelledCapable: true,
    };
  }

  getJobStatus(accountId: string): WarehouseAdminStatusBundle["jobStatus"] {
    const jobs = this.ops.queue.list(accountId);
    return {
      recentFailed: jobs.filter((j) => j.status === "failed").slice(-20),
      recentSuccessful: jobs.filter((j) => j.status === "success").slice(-20),
    };
  }

  getHistory(accountId: string, limit = 50): WarehouseSyncHistoryRecord[] {
    return this.ops.store.listHistory(accountId, limit);
  }

  getHealth(accountId: string): WarehouseHealthSnapshot {
    return this.ops.getHealth(accountId);
  }

  getMetrics(accountId: string): WarehouseOpsMetrics {
    return this.ops.getMonitoring(accountId).metrics;
  }

  getAlerts(accountId: string): WarehouseOpsAlert[] {
    return this.ops.store.listOpenAlerts(accountId);
  }

  getFullBundle(scope: WarehouseScope): WarehouseAdminStatusBundle {
    this.ops.store.ensureDefaultSchedules(scope);
    const monitoring = this.ops.getMonitoring(scope.marketplaceAccountId);
    return {
      warehouseStatus: this.getWarehouseStatus(scope),
      syncStatus: this.getSyncStatus(scope.marketplaceAccountId),
      queueStatus: this.getQueueStatus(scope.marketplaceAccountId),
      jobStatus: this.getJobStatus(scope.marketplaceAccountId),
      history: this.getHistory(scope.marketplaceAccountId),
      health: monitoring.health,
      metrics: monitoring.metrics,
      alerts: this.getAlerts(scope.marketplaceAccountId),
      monitoring,
    };
  }
}
