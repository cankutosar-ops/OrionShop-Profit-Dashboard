/**
 * Orders / Sales / Finance for the worker.
 *
 * This is a thin adapter over `runCommercialContinuityTick`, which already owns
 * account enumeration, due-time calculation, per-account isolation, stale lock
 * release and durable per-entity state. The worker adds nothing but budget
 * slicing, cursor observability and a uniform result shape.
 */

import {
  RETRYABLE_ENTITY_STATUSES,
  type WorkerAccountTaskResult,
} from "../types";
import type { WorkerLogger } from "../logger";
import { readFinanceCursor } from "../finance-cursor";

/** Injection seam, mirroring the finance kernel's `deps` pattern. Tests supply fakes. */
export type CommercialTaskDeps = {
  runTick: typeof import("@/services/commercial-continuity-service").runCommercialContinuityTick;
  readCursor: typeof readFinanceCursor;
};

export type CommercialTaskInput = {
  /** Restrict to these accounts. Omit to let the kernel enumerate eligible accounts. */
  accountIds?: readonly string[] | null;
  force?: boolean;
  /** Absolute wall-clock deadline for this task. */
  deadlineMs: number;
  logger: WorkerLogger;
  deps?: Partial<CommercialTaskDeps>;
};

export async function runCommercialWorkerTask(
  input: CommercialTaskInput
): Promise<WorkerAccountTaskResult[]> {
  const runCommercialContinuityTick =
    input.deps?.runTick ??
    (await import("@/services/commercial-continuity-service"))
      .runCommercialContinuityTick;
  const readCursor = input.deps?.readCursor ?? readFinanceCursor;

  const targets: Array<string | null> =
    input.accountIds && input.accountIds.length > 0
      ? [...input.accountIds]
      : [null];

  const results: WorkerAccountTaskResult[] = [];

  for (const accountId of targets) {
    const remainingMs = input.deadlineMs - Date.now();
    if (remainingMs <= 0) {
      results.push({
        task: "commercial",
        marketplaceAccountId: accountId,
        outcome: "skipped",
        durationMs: 0,
        detail: "budget_exhausted",
      });
      continue;
    }

    const startedMs = Date.now();
    const cursorBefore = accountId ? await readCursor(accountId) : null;

    input.logger.info("task.start", {
      task: "commercial",
      marketplaceAccountId: accountId,
      budgetMs: remainingMs,
      financeCursorBefore: cursorBefore?.rrdId ?? null,
    });

    try {
      const tick = await runCommercialContinuityTick({
        trigger: "scheduled",
        force: input.force,
        ...(accountId ? { marketplaceAccountId: accountId } : {}),
        executionBudgetMs: remainingMs,
      });

      // The kernel already isolates accounts; fan its per-account results out
      // one-for-one so a failure is attributed to the account that caused it.
      for (const accountResult of tick.results) {
        const cursorAfter = await readCursor(
          accountResult.marketplaceAccountId
        );
        const entities = accountResult.entities.map((e) => ({
          entity: e.entity,
          status: e.status,
          latestDataDate: e.latestDataDate ?? null,
          error: e.error ?? null,
        }));
        const rateLimited = entities.some((e) => e.status === "rate_limited");
        const retryable = entities.some((e) =>
          RETRYABLE_ENTITY_STATUSES.includes(e.status)
        );

        const perAccountCursorBefore =
          cursorBefore && accountResult.marketplaceAccountId === accountId
            ? cursorBefore.rrdId
            : null;

        const result: WorkerAccountTaskResult = {
          task: "commercial",
          marketplaceAccountId: accountResult.marketplaceAccountId,
          accountName: accountResult.accountName,
          outcome: accountResult.skipped
            ? "skipped"
            : retryable
              ? "retryable_failure"
              : "success",
          durationMs: Date.now() - startedMs,
          detail: accountResult.skipReason ?? null,
          entities,
          financeCursorBefore: perAccountCursorBefore,
          financeCursorAfter: cursorAfter.rrdId,
          rateLimited,
        };
        results.push(result);

        input.logger.log(
          result.outcome === "retryable_failure" ? "warn" : "info",
          "task.account",
          {
            task: "commercial",
            marketplaceAccountId: result.marketplaceAccountId,
            accountName: result.accountName,
            outcome: result.outcome,
            detail: result.detail,
            entities: result.entities,
            financeCursorBefore: result.financeCursorBefore,
            financeCursorAfter: result.financeCursorAfter,
            rateLimited: result.rateLimited,
            durationMs: result.durationMs,
          }
        );
      }

      if (tick.results.length === 0) {
        results.push({
          task: "commercial",
          marketplaceAccountId: accountId,
          outcome: "skipped",
          durationMs: Date.now() - startedMs,
          detail:
            tick.accountsConsidered === 0
              ? "no_eligible_accounts_or_feature_disabled"
              : "no_account_results",
        });
      }
    } catch (err) {
      // A throw here means the tick itself failed, not one account's sync;
      // durable per-entity state is untouched so the next wake retries.
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        task: "commercial",
        marketplaceAccountId: accountId,
        outcome: "retryable_failure",
        durationMs: Date.now() - startedMs,
        detail: message,
      });
      input.logger.error("task.failed", {
        task: "commercial",
        marketplaceAccountId: accountId,
        error: message,
      });
    }
  }

  return results;
}
