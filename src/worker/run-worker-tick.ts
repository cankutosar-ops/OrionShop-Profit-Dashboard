/**
 * Production Sync Worker orchestrator.
 *
 * One invocation = one bounded tick. It resolves which tasks to run, gives them
 * a shared wall-clock deadline, and converts their results into a single exit
 * code. It never holds state between invocations: everything durable is already
 * in Supabase (`commercial_entity_sync_state`, `finance_incremental_sync_state`,
 * `sync_runs`, `historical_inventory_snapshots`).
 */

import { randomUUID } from "node:crypto";

import {
  DEFAULT_SYNC_WORKER_TASKS,
  DEFAULT_WORKER_EXECUTION_BUDGET_MS,
  WORKER_EXIT_CONFIG_ERROR,
  WORKER_EXIT_OK,
  WORKER_EXIT_RETRYABLE,
  WorkerConfigurationError,
  type SyncWorkerTask,
  type SyncWorkerTickResult,
  type WorkerAccountTaskResult,
} from "./types";
import { createWorkerLogger, type WorkerLogger } from "./logger";
import { assertWorkerEnvironment } from "./env";
import { WORKER_TASK_RUNNERS, type WorkerTaskDeps } from "./tasks";

export type RunSyncWorkerTickInput = {
  tasks?: readonly SyncWorkerTask[];
  accountIds?: readonly string[] | null;
  force?: boolean;
  executionBudgetMs?: number;
  financeCatchupMaxWakes?: number;
  trigger?: string;
  executionId?: string;
  logger?: WorkerLogger;
  /** Skip env assertion. Only for offline verification with injected fakes. */
  skipEnvironmentCheck?: boolean;
  /** Fakes for offline verification. Production leaves this undefined. */
  deps?: WorkerTaskDeps;
};

/**
 * Derive the process exit code from task outcomes.
 *
 * A retryable failure is reported as a distinct non-zero code rather than a
 * generic `1`, because durable state is intact and the next scheduled wake is
 * expected to make progress — the run failed, the data plane did not.
 */
export function resolveWorkerExitCode(
  results: readonly WorkerAccountTaskResult[]
): number {
  return results.some((r) => r.outcome === "retryable_failure")
    ? WORKER_EXIT_RETRYABLE
    : WORKER_EXIT_OK;
}

export async function runSyncWorkerTick(
  input: RunSyncWorkerTickInput = {}
): Promise<SyncWorkerTickResult> {
  const executionId = input.executionId ?? randomUUID();
  const logger = input.logger ?? createWorkerLogger(executionId);
  const trigger = input.trigger ?? "scheduled";
  const tasks = [...(input.tasks?.length ? input.tasks : DEFAULT_SYNC_WORKER_TASKS)];
  const budgetMs = input.executionBudgetMs ?? DEFAULT_WORKER_EXECUTION_BUDGET_MS;

  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const deadlineMs = startedMs + budgetMs;

  logger.info("worker.start", {
    trigger,
    tasks,
    accountIds: input.accountIds ?? "all",
    budgetMs,
    node: process.version,
  });

  if (!input.skipEnvironmentCheck) {
    // Throws WorkerConfigurationError, which the CLI maps to a permanent exit.
    const env = assertWorkerEnvironment();
    if (env.aliasesApplied.length > 0) {
      logger.info("worker.env_aliases", { applied: env.aliasesApplied });
    }
  }

  const results: WorkerAccountTaskResult[] = [];

  for (const task of tasks) {
    const runner = WORKER_TASK_RUNNERS[task];
    if (!runner) {
      throw new WorkerConfigurationError(`Unknown worker task: ${task}`);
    }

    if (Date.now() >= deadlineMs) {
      logger.warn("task.skipped", { task, detail: "budget_exhausted" });
      results.push({
        task,
        marketplaceAccountId: null,
        outcome: "skipped",
        durationMs: 0,
        detail: "budget_exhausted",
      });
      continue;
    }

    try {
      results.push(
        ...(await runner({
          accountIds: input.accountIds,
          force: input.force,
          deadlineMs,
          financeCatchupMaxWakes: input.financeCatchupMaxWakes,
          logger,
          deps: input.deps,
        }))
      );
    } catch (err) {
      // A configuration problem is permanent — surface it rather than letting
      // the tick report a retryable failure every hour forever.
      if (err instanceof WorkerConfigurationError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.error("task.failed", { task, error: message });
      results.push({
        task,
        marketplaceAccountId: null,
        outcome: "retryable_failure",
        durationMs: 0,
        detail: message,
      });
    }
  }

  const finishedMs = Date.now();
  const accountsConsidered = new Set(
    results.map((r) => r.marketplaceAccountId).filter((id): id is string => !!id)
  ).size;

  const tickResult: SyncWorkerTickResult = {
    executionId,
    trigger,
    startedAt,
    finishedAt: new Date(finishedMs).toISOString(),
    durationMs: finishedMs - startedMs,
    tasks,
    accountsConsidered,
    budgetExhausted: finishedMs >= deadlineMs,
    results,
    exitCode: resolveWorkerExitCode(results),
  };

  logger.log(tickResult.exitCode === WORKER_EXIT_OK ? "info" : "warn", "worker.finish", {
    durationMs: tickResult.durationMs,
    accountsConsidered,
    budgetExhausted: tickResult.budgetExhausted,
    exitCode: tickResult.exitCode,
    summary: results.map((r) => ({
      task: r.task,
      marketplaceAccountId: r.marketplaceAccountId,
      outcome: r.outcome,
      detail: r.detail,
    })),
  });

  return tickResult;
}

export { WORKER_EXIT_CONFIG_ERROR, WORKER_EXIT_OK, WORKER_EXIT_RETRYABLE };
