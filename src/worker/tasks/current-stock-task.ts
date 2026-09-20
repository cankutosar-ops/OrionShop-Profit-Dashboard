import { listWorkerAccounts } from "../accounts";
import { WorkerConfigurationError, type WorkerAccountTaskResult } from "../types";
import type { WorkerLogger } from "../logger";
import { syncCanonicalCurrentStock } from "@/lib/marketplace-adapters/wildberries/current-stock-sync";

export type CurrentStockTaskDeps = {
  listAccounts: typeof listWorkerAccounts;
  sync: typeof syncCanonicalCurrentStock;
};

export async function runCurrentStockWorkerTask(input: {
  accountIds?: readonly string[] | null; deadlineMs: number; logger: WorkerLogger;
  deps?: Partial<CurrentStockTaskDeps>;
}): Promise<WorkerAccountTaskResult[]> {
  if (input.accountIds?.length !== 1) throw new WorkerConfigurationError("current-stock requires exactly one explicit account ID");
  const accounts = await (input.deps?.listAccounts ?? listWorkerAccounts)({ accountIds: input.accountIds });
  if (accounts.length !== 1 || accounts[0].id !== input.accountIds[0]) throw new WorkerConfigurationError("Requested current-stock account unavailable");
  const account = accounts[0];
  const start = Date.now();
  try {
    const count = await (input.deps?.sync ?? syncCanonicalCurrentStock)(account.id, input.deadlineMs);
    return [{ task: "current-stock", marketplaceAccountId: account.id, accountName: account.accountName,
      outcome: "success", durationMs: Date.now() - start,
      entities: [{ entity: "current-stock", status: "success", rowsPersisted: count }] }];
  } catch (error) {
    input.logger.error("current-stock.failed", { marketplaceAccountId: account.id,
      error: error instanceof Error ? error.message : String(error) });
    return [{ task: "current-stock", marketplaceAccountId: account.id, accountName: account.accountName,
      outcome: "retryable_failure", durationMs: Date.now() - start, detail: "Current stock unavailable; inspect task log" }];
  }
}
