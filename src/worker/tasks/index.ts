/**
 * Worker task registry.
 *
 * Adding a sync domain to the worker means registering a runner here — the
 * orchestrator, CLI and workflow need no changes. `ads` is registered but
 * unimplemented on purpose: it reserves the extension point without pretending
 * the ingestion exists.
 */

import type { SyncWorkerTask, WorkerAccountTaskResult } from "../types";
import type { WorkerLogger } from "../logger";
import { runCommercialWorkerTask, type CommercialTaskDeps } from "./commercial-task";
import { runInventoryWorkerTask, type InventoryTaskDeps } from "./inventory-task";
import {
  runFinanceCatchupWorkerTask,
  type FinanceCatchupTaskDeps,
} from "./finance-catchup-task";

/** Fakes injected by offline verification. Production leaves this undefined. */
export type WorkerTaskDeps = {
  commercial?: Partial<CommercialTaskDeps>;
  inventory?: Partial<InventoryTaskDeps>;
  financeCatchup?: Partial<FinanceCatchupTaskDeps>;
};

export type WorkerTaskContext = {
  accountIds?: readonly string[] | null;
  force?: boolean;
  /** Absolute wall-clock deadline shared by every task in this invocation. */
  deadlineMs: number;
  financeCatchupMaxWakes?: number;
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

  // Extension point. Advertising ingestion is out of scope; registering it here
  // keeps the surface honest and makes `--tasks ads` report rather than crash.
  ads: async (ctx) => {
    ctx.logger.warn("task.not_implemented", {
      task: "ads",
      detail: "advertising ingestion is not implemented yet",
    });
    return [
      {
        task: "ads",
        marketplaceAccountId: null,
        outcome: "not_implemented",
        durationMs: 0,
        detail: "advertising ingestion is not implemented yet",
      },
    ];
  },
};

export { runCommercialWorkerTask, runInventoryWorkerTask, runFinanceCatchupWorkerTask };
