/**
 * Production Sync Worker — public surface.
 *
 * Deployment-agnostic on purpose: GitHub Actions is only the first scheduler.
 * Moving to a VPS, a container or a managed cron means calling
 * `runSyncWorkerTick` from a different entrypoint, nothing more.
 */

export * from "./types";
export * from "./env";
export { createWorkerLogger, redact, type WorkerLogger } from "./logger";
export { listWorkerAccounts, type WorkerAccount } from "./accounts";
export { readFinanceCursor, type FinanceCursorSnapshot } from "./finance-cursor";
export { runSyncWorkerTick, resolveWorkerExitCode } from "./run-worker-tick";
export {
  WORKER_TASK_RUNNERS,
  type WorkerTaskContext,
  type WorkerTaskRunner,
} from "./tasks";
