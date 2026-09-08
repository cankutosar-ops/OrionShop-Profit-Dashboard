/**
 * Opt-in extra Reports/V1 page wakes.
 *
 * The `commercial` task already advances finance by one page per account per
 * tick, which is correct for steady state but slow when a week of history has
 * to be caught up. This task loops the *same* kernel
 * (`runFinanceIncrementalSync`) a bounded number of times.
 *
 * It deliberately owns no cursor logic. Every wake goes through the existing
 * guards — reservation, seller-id isolation, pacing gate, DB lock — and the
 * loop stops the moment the kernel reports anything other than a clean page,
 * so a 429 ends the task instead of becoming a retry storm.
 */

import { DEFAULT_FINANCE_CATCHUP_MAX_WAKES, type WorkerAccountTaskResult } from "../types";
import type { WorkerLogger } from "../logger";
import { listWorkerAccounts } from "../accounts";
import { readFinanceCursor } from "../finance-cursor";

/** Injection seam, mirroring the finance kernel's `deps` pattern. Tests supply fakes. */
export type FinanceCatchupTaskDeps = {
  runWake: typeof import("@/lib/finance-incremental").runFinanceIncrementalSync;
  listAccounts: typeof listWorkerAccounts;
  readCursor: typeof readFinanceCursor;
};

export type FinanceCatchupTaskInput = {
  accountIds?: readonly string[] | null;
  deadlineMs: number;
  maxWakesPerAccount?: number;
  logger: WorkerLogger;
  deps?: Partial<FinanceCatchupTaskDeps>;
};

/** Outcomes that must end the loop rather than trigger another request. */
const STOP_STATUSES = new Set(["rate_limited", "blocked", "failed", "idle", "week_complete"]);

export async function runFinanceCatchupWorkerTask(
  input: FinanceCatchupTaskInput
): Promise<WorkerAccountTaskResult[]> {
  const runFinanceIncrementalSync =
    input.deps?.runWake ??
    (await import("@/lib/finance-incremental")).runFinanceIncrementalSync;
  const listAccounts = input.deps?.listAccounts ?? listWorkerAccounts;
  const readCursor = input.deps?.readCursor ?? readFinanceCursor;

  const maxWakes = Math.max(1, input.maxWakesPerAccount ?? DEFAULT_FINANCE_CATCHUP_MAX_WAKES);
  const accounts = await listAccounts({ accountIds: input.accountIds });
  const results: WorkerAccountTaskResult[] = [];

  for (const account of accounts) {
    const startedMs = Date.now();
    const cursorBefore = await readCursor(account.id);
    let wakes = 0;
    let lastStatus = "idle";
    let lastError: string | null = null;
    let rateLimited = false;
    let rowsPersisted = 0;

    input.logger.info("task.start", {
      task: "finance-catchup",
      marketplaceAccountId: account.id,
      maxWakes,
      financeCursorBefore: cursorBefore.rrdId,
      blockedUntil: cursorBefore.blockedUntil,
    });

    try {
      while (wakes < maxWakes && Date.now() < input.deadlineMs) {
        const outcome = await runFinanceIncrementalSync({ accountId: account.id });
        wakes += 1;
        lastStatus = outcome.status;
        lastError = outcome.error;
        rowsPersisted += outcome.persistedRows;

        input.logger.info("finance.wake", {
          marketplaceAccountId: account.id,
          wake: wakes,
          status: outcome.status,
          httpStatus: outcome.httpStatus,
          rowsFetched: outcome.responseRows,
          rowsPersisted: outcome.persistedRows,
          cursorBefore: outcome.cursorBefore,
          cursorAfter: outcome.cursorAfter,
          cursorAdvancedBeforePersist: outcome.cursorAdvancedBeforePersist,
          retryPerformed: outcome.retryPerformed,
          error: lastError,
        });

        if (outcome.status === "rate_limited") rateLimited = true;
        if (STOP_STATUSES.has(outcome.status)) break;
      }
    } catch (err) {
      lastStatus = "failed";
      lastError = err instanceof Error ? err.message : String(err);
      input.logger.error("task.failed", {
        task: "finance-catchup",
        marketplaceAccountId: account.id,
        error: lastError,
      });
    }

    const cursorAfter = await readCursor(account.id);
    results.push({
      task: "finance-catchup",
      marketplaceAccountId: account.id,
      accountName: account.accountName,
      outcome:
        lastStatus === "failed"
          ? "retryable_failure"
          : lastStatus === "rate_limited" || lastStatus === "blocked"
            ? "skipped"
            : "success",
      durationMs: Date.now() - startedMs,
      detail: `${lastStatus} after ${wakes} wake(s)${lastError ? `: ${lastError}` : ""}`,
      entities: [
        {
          entity: "finance",
          status: lastStatus,
          rowsPersisted,
          error: lastError,
        },
      ],
      financeCursorBefore: cursorBefore.rrdId,
      financeCursorAfter: cursorAfter.rrdId,
      rateLimited,
    });
  }

  return results;
}
