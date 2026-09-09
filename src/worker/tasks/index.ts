/**
 * Worker task registry.
 *
 * Adding a sync domain to the worker means registering a runner here — the
 * orchestrator, CLI and workflow need no changes.
 */

import type { SyncWorkerTask, WorkerAccountTaskResult } from "../types";
import type { WorkerLogger } from "../logger";
import { runCommercialWorkerTask, type CommercialTaskDeps } from "./commercial-task";
import { runInventoryWorkerTask, type InventoryTaskDeps } from "./inventory-task";
import {
  runFinanceCatchupWorkerTask,
  type FinanceCatchupTaskDeps,
} from "./finance-catchup-task";
import { runAdsWorkerTask, type AdsTaskDeps } from "./ads-task";

/** Fakes injected by offline verification. Production leaves this undefined. */
export type WorkerTaskDeps = {
  commercial?: Partial<CommercialTaskDeps>;
  inventory?: Partial<InventoryTaskDeps>;
  financeCatchup?: Partial<FinanceCatchupTaskDeps>;
  ads?: Partial<AdsTaskDeps>;
};

export type WorkerTaskContext = {
  accountIds?: readonly string[] | null;
  force?: boolean;
  /** Absolute wall-clock deadline shared by every task in this invocation. */
  deadlineMs: number;
  financeCatchupMaxWakes?: number;
  /** Explicit advertising backfill window; omitted for the incremental lookback. */
  adsFrom?: string;
  adsTo?: string;
  logger: WorkerLogger;
  deps?: WorkerTaskDeps;
};

export type WorkerTaskRunner = (
  context: WorkerTaskContext
) => Promise<WorkerAccountTaskResult[]>;

export const WORKER_TASK_RUNNERS: Record<SyncWorkerTask, WorkerTaskRunner> = {
  commercial: (ctx) =>
    runCommercialWorkerTask({
      accountIds: ctx.accountIds,
      force: ctx.force,
      deadlineMs: ctx.deadlineMs,
      logger: ctx.logger,
      deps: ctx.deps?.commercial,
    }),

  inventory: (ctx) =>
    runInventoryWorkerTask({
      accountIds: ctx.accountIds,
      deadlineMs: ctx.deadlineMs,
      logger: ctx.logger,
      deps: ctx.deps?.inventory,
    }),

  "finance-catchup": (ctx) =>
    runFinanceCatchupWorkerTask({
      accountIds: ctx.accountIds,
      deadlineMs: ctx.deadlineMs,
      maxWakesPerAccount: ctx.financeCatchupMaxWakes,
      logger: ctx.logger,
      deps: ctx.deps?.financeCatchup,
    }),

  ads: (ctx) =>
    runAdsWorkerTask({
      accountIds: ctx.accountIds,
      deadlineMs: ctx.deadlineMs,
      logger: ctx.logger,
      from: ctx.adsFrom,
      to: ctx.adsTo,
      deps: ctx.deps?.ads,
    }),
};

export {
  runCommercialWorkerTask,
  runInventoryWorkerTask,
  runFinanceCatchupWorkerTask,
  runAdsWorkerTask,
};
