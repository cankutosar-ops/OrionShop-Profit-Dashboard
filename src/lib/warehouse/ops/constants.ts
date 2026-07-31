/**
 * Sprint 10.4 — Configurable default schedule intervals (overridable per account).
 * Logic never hardcodes timing — always reads from ScheduleConfigStore.
 */

import type { IncrementalSyncEntity } from "@/lib/warehouse/incremental/constants";
import { INCREMENTAL_SYNC_ENTITY_ORDER } from "@/lib/warehouse/incremental/constants";

/** Default intervals in ms — examples from sprint; config overrides win. */
export const DEFAULT_SCHEDULE_INTERVALS_MS: Record<IncrementalSyncEntity, number> = {
  products: 6 * 60 * 60 * 1000,
  orders: 5 * 60 * 1000,
  sales: 10 * 60 * 1000,
  finance: 15 * 60 * 1000,
  stocks: 30 * 60 * 1000,
  prices: 30 * 60 * 1000,
};

export const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_DELAY_MS = 60_000;
export const DEFAULT_QUEUE_OVERFLOW_THRESHOLD = 50;
export const DEFAULT_LONG_RUNNING_JOB_MS = 30 * 60 * 1000;
export const DEFAULT_STALE_MULTIPLIER = 3;

export type RetryPolicyConfig = {
  maxAttempts: number;
  delayMs: number;
};

export type OpsThresholdConfig = {
  queueOverflowThreshold: number;
  longRunningJobMs: number;
  /** Entity is stale when last success older than intervalMs * staleMultiplier. */
  staleMultiplier: number;
  consecutiveFailureAlertAt: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  maxAttempts: DEFAULT_RETRY_MAX_ATTEMPTS,
  delayMs: DEFAULT_RETRY_DELAY_MS,
};

export const DEFAULT_OPS_THRESHOLDS: OpsThresholdConfig = {
  queueOverflowThreshold: DEFAULT_QUEUE_OVERFLOW_THRESHOLD,
  longRunningJobMs: DEFAULT_LONG_RUNNING_JOB_MS,
  staleMultiplier: DEFAULT_STALE_MULTIPLIER,
  consecutiveFailureAlertAt: 3,
};

export function listSchedulableEntities(): IncrementalSyncEntity[] {
  return [...INCREMENTAL_SYNC_ENTITY_ORDER];
}

export function dedupeKeyForJob(
  jobType: string,
  entities: readonly string[],
  triggerSource: string
): string {
  const sorted = [...entities].sort().join(",");
  return `${jobType}|${sorted || "*"}|${triggerSource}`;
}
