/**
 * Inventory daily snapshot / continuity for the worker.
 *
 * Replaces the web process's `setInterval` scheduler as the production trigger.
 * The underlying work is unchanged — `runInventorySnapshotContinuityForAccount`
 * is the same kernel the scheduler called — but the worker iterates accounts
 * itself so it can enforce a wall-clock budget and isolate per-account failures.
 */

import type { WorkerAccountTaskResult } from "../types";
import type { WorkerLogger } from "../logger";
import { listWorkerAccounts } from "../accounts";

/** Injection seam, mirroring the finance kernel's `deps` pattern. Tests supply fakes. */
export type InventoryTaskDeps = {
  runForAccount: typeof import("@/services/inventory-snapshot-continuity-service").runInventorySnapshotContinuityForAccount;
  listAccounts: typeof listWorkerAccounts;
};

export type InventoryTaskInput = {
  accountIds?: readonly string[] | null;
  deadlineMs: number;
  logger: WorkerLogger;
  deps?: Partial<InventoryTaskDeps>;
};

export async function runInventoryWorkerTask(
  input: InventoryTaskInput
): Promise<WorkerAccountTaskResult[]> {
  const runInventorySnapshotContinuityForAccount =
    input.deps?.runForAccount ??
    (await import("@/services/inventory-snapshot-continuity-service"))
      .runInventorySnapshotContinuityForAccount;
  const listAccounts = input.deps?.listAccounts ?? listWorkerAccounts;

  const accounts = await listAccounts({ accountIds: input.accountIds });
  const results: WorkerAccountTaskResult[] = [];

  for (const account of accounts) {
    if (Date.now() >= input.deadlineMs) {
      results.push({
        task: "inventory",
        marketplaceAccountId: account.id,
        accountName: account.accountName,
        outcome: "skipped",
        durationMs: 0,
        detail: "budget_exhausted",
      });
      continue;
    }

    const startedMs = Date.now();
    input.logger.info("task.start", {
      task: "inventory",
      marketplaceAccountId: account.id,
    });

    try {
      const outcome = await runInventorySnapshotContinuityForAccount(account.id, {
        trigger: "scheduled",
      });

      const result: WorkerAccountTaskResult = {
        task: "inventory",
        marketplaceAccountId: account.id,
        accountName: account.accountName,
        outcome: outcome.capture.status === "failed" ? "retryable_failure" : "success",
        durationMs: Date.now() - startedMs,
        detail: outcome.continuousFromActivation
          ? "continuous_from_activation"
          : `missing_dates=${outcome.missingAfter.length}`,
        entities: [
          {
            entity: "inventory",
            status: outcome.capture.status,
            rowsPersisted: outcome.capture.rowsUpserted ?? null,
          },
        ],
      };
      results.push(result);

      input.logger.log(
        result.outcome === "retryable_failure" ? "warn" : "info",
        "task.account",
        {
          task: "inventory",
          marketplaceAccountId: account.id,
          accountName: account.accountName,
          outcome: result.outcome,
          captureStatus: outcome.capture.status,
          rowsFetched: outcome.capture.recordsRead,
          rowsPersisted: outcome.capture.rowsUpserted,
          activationDate: outcome.activationDate,
          missingBefore: outcome.missingBefore.length,
          missingAfter: outcome.missingAfter.length,
          gapsFilled: outcome.gapsFilled.length,
          purgedRows: outcome.purgedRows,
          durationMs: result.durationMs,
        }
      );
    } catch (err) {
      // Isolated: one account's inventory failure must not stop the others.
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        task: "inventory",
        marketplaceAccountId: account.id,
        accountName: account.accountName,
        outcome: "retryable_failure",
        durationMs: Date.now() - startedMs,
        detail: message,
      });
      input.logger.error("task.failed", {
        task: "inventory",
        marketplaceAccountId: account.id,
        error: message,
      });
    }
  }

  return results;
}
