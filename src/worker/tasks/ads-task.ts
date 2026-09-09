/**
 * Advertising ingestion for the worker.
 *
 * A thin adapter over `runAdvertisingSyncForAccount`, matching the inventory
 * task's shape: the worker enumerates accounts, enforces the wall-clock budget
 * and isolates per-account failures; the kernel owns the API, mapping and
 * persistence.
 *
 * Not in DEFAULT_SYNC_WORKER_TASKS. /adv/v3/fullstats allows only 3 requests per
 * minute, so a full window costs real wall-clock time; scheduling this hourly
 * alongside commercial+inventory would risk the tick budget. It is opt-in via
 * `--tasks ads`, and the default incremental window is deliberately short.
 */

import type { WorkerAccountTaskResult } from "../types";
import type { WorkerLogger } from "../logger";
import { listWorkerAccounts } from "../accounts";

/**
 * How far back an incremental run re-reads.
 *
 * Not 1 day: WB revises recent advertising spend for several days after the
 * fact, and the upsert key makes re-reading a settled day free of duplicates.
 * Re-reading is the only correction mechanism the advertising API offers —
 * there is no cursor to resume from.
 */
export const ADS_INCREMENTAL_LOOKBACK_DAYS = 14;

export type AdsTaskDeps = {
  runForAccount: typeof import("@/services/advertising-sync-service").runAdvertisingSyncForAccount;
  listAccounts: typeof listWorkerAccounts;
  today: () => Date;
};

export type AdsTaskInput = {
  accountIds?: readonly string[] | null;
  deadlineMs: number;
  logger: WorkerLogger;
  /** Explicit backfill window. Omitted for the incremental lookback. */
  from?: string;
  to?: string;
  lookbackDays?: number;
  deps?: Partial<AdsTaskDeps>;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runAdsWorkerTask(input: AdsTaskInput): Promise<WorkerAccountTaskResult[]> {
  const runAdvertisingSyncForAccount =
    input.deps?.runForAccount ??
    (await import("@/services/advertising-sync-service")).runAdvertisingSyncForAccount;
  const listAccounts = input.deps?.listAccounts ?? listWorkerAccounts;
  const today = input.deps?.today ?? (() => new Date());

  const to = input.to ?? isoDate(today());
  const from =
    input.from ??
    isoDate(
      new Date(
        Date.parse(`${to}T00:00:00Z`) -
          (input.lookbackDays ?? ADS_INCREMENTAL_LOOKBACK_DAYS) * 86_400_000
      )
    );

  const accounts = await listAccounts({ accountIds: input.accountIds });
  const results: WorkerAccountTaskResult[] = [];

  for (const account of accounts) {
    if (Date.now() >= input.deadlineMs) {
      results.push({
        task: "ads",
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
      task: "ads",
      marketplaceAccountId: account.id,
      from,
      to,
    });

    try {
      const outcome = await runAdvertisingSyncForAccount(account.id, {
        from,
        to,
        deadlineAt: input.deadlineMs,
      });

      const result: WorkerAccountTaskResult = {
        task: "ads",
        marketplaceAccountId: account.id,
        accountName: account.accountName,
        // Errors here are per-window and safe to retry: the source_key upsert
        // means a repeated window converges rather than duplicating.
        outcome: outcome.errors.length > 0 ? "retryable_failure" : "success",
        durationMs: Date.now() - startedMs,
        detail:
          outcome.errors.length > 0
            ? outcome.errors.slice(0, 3).join("; ")
            : `rows=${outcome.rowsPersisted} spend=${outcome.spendPersisted}`,
        entities: [
          {
            entity: "ads",
            status: outcome.errors.length > 0 ? "failed" : "success",
            rowsPersisted: outcome.rowsPersisted,
            error: outcome.errors[0] ?? null,
          },
        ],
      };
      results.push(result);

      input.logger.log(
        result.outcome === "retryable_failure" ? "warn" : "info",
        "task.account",
        {
          task: "ads",
          marketplaceAccountId: account.id,
          accountName: account.accountName,
          outcome: result.outcome,
          from,
          to,
          campaignsRetrievable: outcome.campaignsRetrievable,
          campaignsUnretrievable: outcome.campaignsUnretrievable,
          fullstatsRequests: outcome.fullstatsRequests,
          rowsMapped: outcome.rowsMapped,
          rowsPersisted: outcome.rowsPersisted,
          rowsUnmatched: outcome.rowsUnmatched,
          spendPersisted: outcome.spendPersisted,
          spendUnmatched: outcome.spendUnmatched,
          durationMs: result.durationMs,
        }
      );

      // Unmatched spend is money the P&L will never see, because unattributed
      // ad rows are excluded by both the read path and RLS. Surface it loudly.
      if (outcome.rowsUnmatched > 0) {
        input.logger.warn("task.ads_unmatched_spend", {
          task: "ads",
          marketplaceAccountId: account.id,
          rowsUnmatched: outcome.rowsUnmatched,
          spendUnmatched: outcome.spendUnmatched,
          nmIds: outcome.unmatchedNmIds.slice(0, 20),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        task: "ads",
        marketplaceAccountId: account.id,
        accountName: account.accountName,
        outcome: "retryable_failure",
        durationMs: Date.now() - startedMs,
        detail: message,
      });
      input.logger.error("task.failed", {
        task: "ads",
        marketplaceAccountId: account.id,
        error: message,
      });
    }
  }

  return results;
}
