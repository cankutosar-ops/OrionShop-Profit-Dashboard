/**
 * Production Sync Worker — shared types and exit contract.
 *
 * The worker is a plain Node process. It owns no sync logic of its own: every
 * task delegates to an existing kernel (commercial continuity, finance
 * incremental, inventory continuity). Durable state lives in Supabase, never on
 * the worker filesystem, so any invocation can resume what the previous one left.
 */

/** Tasks the worker knows how to run. `ads` is a declared extension point only. */
export const SYNC_WORKER_TASKS = [
  "commercial",
  "inventory",
  "finance-catchup",
  "ads",
] as const;

export type SyncWorkerTask = (typeof SYNC_WORKER_TASKS)[number];

/**
 * Default scheduled tick. Deliberately small: `commercial` already advances
 * orders, sales and one finance page per account. `finance-catchup` is opt-in
 * because it consumes additional Reports/V1 quota.
 */
export const DEFAULT_SYNC_WORKER_TASKS: readonly SyncWorkerTask[] = [
  "commercial",
  "inventory",
];

export type SyncWorkerOutcome =
  /** Work completed, or nothing was due. */
  | "success"
  /** Intentionally not attempted (not due, budget exhausted, feature disabled). */
  | "skipped"
  /** Failed in a way the next invocation can retry. Durable state is unchanged. */
  | "retryable_failure"
  /** Task exists as an extension point but has no implementation yet. */
  | "not_implemented";

/** Outcomes that mean "the next wake should try again". */
export const RETRYABLE_ENTITY_STATUSES: readonly string[] = [
  "failed",
  "rate_limited",
  "external_unavailable",
  "permission_denied",
];

export type WorkerEntityReport = {
  entity: string;
  status: string;
  latestDataDate?: string | null;
  rowsPersisted?: number | null;
  error?: string | null;
};

export type WorkerAccountTaskResult = {
  task: SyncWorkerTask;
  marketplaceAccountId: string | null;
  accountName?: string | null;
  outcome: SyncWorkerOutcome;
  durationMs: number;
  detail?: string | null;
  entities?: WorkerEntityReport[];
  /** Finance Reports/V1 rrdId cursor, captured around the tick for auditability. */
  financeCursorBefore?: number | null;
  financeCursorAfter?: number | null;
  rateLimited?: boolean;
};

export type SyncWorkerTickResult = {
  executionId: string;
  trigger: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  tasks: SyncWorkerTask[];
  accountsConsidered: number;
  budgetExhausted: boolean;
  results: WorkerAccountTaskResult[];
  exitCode: number;
};

/** All work succeeded or was legitimately skipped. */
export const WORKER_EXIT_OK = 0;
/** Something retryable failed. Durable state is intact; the next wake resumes. */
export const WORKER_EXIT_RETRYABLE = 10;
/** Misconfiguration (missing secret, undecryptable credential). Retrying will not help. */
export const WORKER_EXIT_CONFIG_ERROR = 20;

/**
 * Thrown for problems no retry can fix, so the workflow fails loudly instead of
 * quietly reporting a transient error every hour.
 */
export class WorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerConfigurationError";
  }
}

/**
 * Default wall-clock budget for one invocation. Kept well under the hourly
 * cadence so a slow tick can never overlap the next one.
 */
export const DEFAULT_WORKER_EXECUTION_BUDGET_MS = 25 * 60 * 1000;

/** Max additional Reports/V1 page wakes per account for the opt-in catch-up task. */
export const DEFAULT_FINANCE_CATCHUP_MAX_WAKES = 4;
