/**
 * Sprint 10.4 — Operational Warehouse types (scheduler, queue, monitoring).
 */

import type {
  WarehouseMarketplaceType,
  WarehousePlatformEntity,
  WarehouseTriggerSource,
} from "@/lib/warehouse/types";
import type { IncrementalSyncEntity } from "@/lib/warehouse/incremental/constants";

export const WAREHOUSE_HEALTH_STATES = [
  "healthy",
  "degraded",
  "sync_delayed",
  "failed",
  "unknown",
] as const;
export type WarehouseHealthState = (typeof WAREHOUSE_HEALTH_STATES)[number];

export const WAREHOUSE_QUEUE_STATUSES = [
  "waiting",
  "running",
  "success",
  "failed",
  "cancelled",
  "deduped",
] as const;
export type WarehouseQueueStatus = (typeof WAREHOUSE_QUEUE_STATUSES)[number];

export const WAREHOUSE_JOB_TYPES = ["incremental", "retry", "manual"] as const;
export type WarehouseJobType = (typeof WAREHOUSE_JOB_TYPES)[number];

export const WAREHOUSE_ALERT_TYPES = [
  "consecutive_failures",
  "long_running_job",
  "stale_data",
  "queue_overflow",
] as const;
export type WarehouseAlertType = (typeof WAREHOUSE_ALERT_TYPES)[number];

export type WarehouseScheduleConfig = {
  id: string;
  marketplaceType: WarehouseMarketplaceType;
  companyId: string;
  marketplaceAccountId: string;
  entity: IncrementalSyncEntity;
  intervalMs: number;
  enabled: boolean;
  lastEnqueuedAt: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WarehouseQueueJob = {
  id: string;
  marketplaceType: WarehouseMarketplaceType;
  companyId: string;
  marketplaceAccountId: string;
  jobType: WarehouseJobType;
  entities: IncrementalSyncEntity[];
  triggerSource: WarehouseTriggerSource | "api";
  status: WarehouseQueueStatus;
  priority: number;
  dedupeKey: string;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  sessionId: string | null;
  errorMessage: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WarehouseSyncHistoryRecord = {
  id: string;
  marketplaceType: WarehouseMarketplaceType;
  companyId: string;
  marketplaceAccountId: string;
  queueJobId: string | null;
  sessionId: string | null;
  triggerSource: string;
  entity: WarehousePlatformEntity | null;
  status: "success" | "partial" | "failed" | "cancelled" | "blocked";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  insertedRows: number;
  updatedRows: number;
  failedRows: number;
  skippedRows: number;
  apiCalls: number;
  retryCount: number;
  queueWaitMs: number | null;
  errorMessage: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
};

export type WarehouseOpsAlert = {
  id: string;
  marketplaceType: WarehouseMarketplaceType;
  companyId: string;
  marketplaceAccountId: string;
  alertType: WarehouseAlertType;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "resolved";
  title: string;
  message: string;
  meta: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
};

export type WarehouseRetryState = {
  marketplaceAccountId: string;
  entity: IncrementalSyncEntity;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  status: "idle" | "pending" | "exhausted";
  updatedAt: string;
};

export type WarehouseOpsMetrics = {
  totalSyncs: number;
  successCount: number;
  failureCount: number;
  partialCount: number;
  successRate: number;
  averageDurationMs: number;
  rowsProcessed: number;
  apiCalls: number;
  retryCount: number;
  averageQueueWaitMs: number;
  runningJobs: number;
  waitingJobs: number;
  failedJobs: number;
  successfulJobs: number;
};

export type WarehouseHealthSnapshot = {
  state: WarehouseHealthState;
  reason: string;
  lastSuccessfulSyncAt: string | null;
  lastFailedSyncAt: string | null;
  consecutiveFailures: number;
  openAlerts: number;
  staleEntities: IncrementalSyncEntity[];
};

export type WarehouseMonitoringSnapshot = {
  runningJobs: WarehouseQueueJob[];
  waitingJobs: WarehouseQueueJob[];
  failedJobs: WarehouseQueueJob[];
  successfulJobsRecent: WarehouseQueueJob[];
  averageDurationMs: number;
  lastSuccessfulSyncAt: string | null;
  lastFailedSyncAt: string | null;
  currentEntity: string | null;
  currentProgress: Record<string, unknown> | null;
  health: WarehouseHealthSnapshot;
  metrics: WarehouseOpsMetrics;
};
