# Production Sync Worker

How Wildberries data reaches the warehouse in production, and why the web
application never talks to WB.

## Architecture

Two planes that never cross:

```
Read plane (every user request)
  USER -> Netlify / Next.js -> Supabase warehouse -> Financial Engine -> UI
  WB API calls: 0

Write plane (scheduled, headless)
  GitHub Actions -> Node worker -> WB APIs -> normalize -> Supabase warehouse
  WB API calls: allowed, and only here
```

The dashboard, all reports, all exports and the Financial Engine read from the
Supabase warehouse only. A page load that needed a WB request would be both slow
and rate-limit-fragile, so the boundary is enforced by
`npm run verify:production-data-plane` rather than left to convention.

## Where the code lives

| Layer | Path | Responsibility |
|---|---|---|
| Orchestrator | `src/worker/run-worker-tick.ts` | One bounded tick; budget, task ordering, exit code |
| Task registry | `src/worker/tasks/index.ts` | Maps a task name to a runner; ads extension point |
| Task adapters | `src/worker/tasks/*.ts` | Thin adapters onto existing kernels |
| Logging | `src/worker/logger.ts` | JSON lines with secret redaction |
| Environment | `src/worker/env.ts` | Required secrets, server-shaped aliases |
| CLI entrypoint | `scripts/run-sync-worker.mjs` | Arg parsing and exit-code mapping only |
| Scheduler | `.github/workflows/sync-worker.yml` | Hourly trigger and concurrency |

The worker owns **no sync logic**. Every task delegates to a kernel that already
existed and is already covered by its own verification script:

| Task | Delegates to | Covers |
|---|---|---|
| `commercial` | `runCommercialContinuityTick` | Orders, Sales, Finance (one Reports/V1 page per account) |
| `inventory` | `runInventorySnapshotContinuityForAccount` | Daily snapshot, gap recovery (no retention purge — see below) |
| `finance-catchup` | `runFinanceIncrementalSync` | Opt-in extra Reports/V1 page wakes |
| `ads` | — | Registered extension point, not implemented |

Because the worker is a plain Node process calling domain modules directly, it
is not coupled to GitHub Actions. Moving to a VPS, a container or a managed cron
means running the same command from somewhere else; no business logic moves.

## Before the first production run

> **Blocker as of this writing.** 18 of the 96 modules the worker imports —
> including `src/services/commercial-continuity-service.ts` and
> `src/services/inventory-snapshot-continuity-service.ts`, which back *both*
> default tasks — exist only in the working tree. On a clean checkout the worker
> fails with `MODULE_NOT_FOUND` before doing any work. The scheduled trigger only
> fires from the repository's default branch, so nothing runs while this sits on
> a feature branch, but the worker cannot go to production until that Sprint 10.7
> work is committed. `npm run verify:worker-readiness` fails until it is.

```bash
npm run verify:worker-readiness
```

This is the gate the workflow runs before every tick. It makes no WB request and
writes nothing to Supabase: it executes the CLI as a real child process, imports
the task registry and every sync kernel, exercises configuration validation and
log redaction, parses the workflow, and resolves the page-load import graphs.

### Runtime pin

The worker runs under `tsx`, pinned to an exact version in `devDependencies` and
in `package-lock.json`. CI installs with `npm ci` and invokes
`npx --no-install tsx`, which fails loudly rather than silently downloading a
different version from the registry.

### Working directory

`tsx` finds the `tsconfig.json` that defines the `@/*` path alias through the
process working directory, and it does so before the entrypoint runs. Launched
from anywhere other than the repository root, every `@/` import fails.

Running from the repository root — what `npm run worker:sync` and the workflow
both do — needs nothing extra. Any other launcher (container, systemd unit, cron
entry) must set `TSX_TSCONFIG_PATH=/path/to/repo/tsconfig.json`. The CLI detects
this case and exits `20` with that instruction instead of a bare
`MODULE_NOT_FOUND`.

## Running it

```bash
# Default hourly tick: orders, sales, finance (1 page/account), inventory
npm run worker:sync

# One account only
npm run worker:sync -- --accounts 1

# Catch up finance history faster (extra Reports/V1 quota)
npm run worker:sync -- --tasks finance-catchup --finance-wakes 8

# Ignore .env files and take configuration from the environment only.
# The workflow always passes this so a stray .env cannot shadow real secrets.
npm run worker:sync -- --no-dotenv

# Full option list
npm run worker:sync -- --help
```

### Exit codes

| Code | Meaning | Operator action |
|---|---|---|
| `0` | All work succeeded or was legitimately skipped | None |
| `10` | Retryable failure. Durable state intact; next wake resumes | Watch for repeats |
| `20` | Permanent configuration error (missing secret) | Fix secrets; retrying will not help |
| `1` | Unexpected crash | Investigate the log |

`10` is deliberately distinct from `1`: a rate-limited account is a failed *run*,
not a broken data plane.

## Scheduling

GitHub Actions, hourly at `:20`. Configured in
`.github/workflows/sync-worker.yml`.

Two safeguards prevent overlap:

- `concurrency: { group: sync-worker, cancel-in-progress: false }`. A second run
  waits instead of cancelling the first. Cancelling mid-page would abandon a
  held database lock rather than release it.
- A 25-minute worker budget (`--budget-ms 1500000`) inside a 35-minute job
  timeout, so a wedged kernel cannot run into the next hour.

Manual runs are available through **Actions → Sync Worker → Run workflow**, with
inputs for tasks, accounts, force and finance wake count.

## Secrets

Set these as GitHub Actions **secrets** (Settings → Secrets and variables →
Actions):

| Secret | Why |
|---|---|
| `SUPABASE_URL` | Warehouse endpoint |
| `SUPABASE_ANON_KEY` | Validated alongside the URL before the service-role client is built |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker writes bypass RLS |
| `MARKETPLACE_CREDENTIALS_KEY` | Decrypts per-account WB keys |

And this as a repository **variable**:

| Variable | Value |
|---|---|
| `ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE` | `false` to let the worker sync Account 2 finance |

Notes:

- **Per-account WB API keys are never stored in GitHub.** They stay encrypted in
  `marketplace_accounts.api_key_encrypted` and are decrypted at runtime with
  `MARKETPLACE_CREDENTIALS_KEY`. Adding an account requires no workflow change.
- **`INTERNAL_API_SECRET` is not needed.** The worker calls domain modules
  directly and never makes an HTTP request to its own application.
- **No `NEXT_PUBLIC_` naming is required.** `src/worker/env.ts` accepts the
  server-shaped aliases above and normalises them internally.
- Secrets are never logged. `src/worker/logger.ts` redacts known secret values
  and JWT-shaped strings from every line, verified by `verify:sync-worker`.

## Account isolation

Accounts are processed independently. One account failing never stops or
contaminates another:

- Each account has its own credentials, its own sync state rows and its own
  `marketplace_account_id` on every persisted row.
- `runCommercialContinuityTick` wraps each account in its own try/catch; the
  worker does the same for inventory.
- A tick where Account 1 succeeds and Account 2 is rate limited reports
  success for Account 1, `rate_limited` for Account 2, and exits `10`.

Verified by case B of `npm run verify:sync-worker`.

### Account 2 finance is fail-closed

`resolveFinanceRecoveryReservation` blocks Account 2 finance whenever it cannot
prove who owns the WB Reports quota. A CI runner has no visibility of an
operator's local recovery campaign, so if
`ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE` is unset the worker **skips Account 2
finance** rather than risk competing with a historical recovery. This is
intended. Set the variable to `false` to release the quota to the worker.

## Durable state and concurrency

The worker keeps nothing on its own filesystem. It is safe to kill and restart at
any point; all progress lives in Supabase:

| State | Table |
|---|---|
| Per-entity freshness, retries, next-due | `commercial_entity_sync_state` |
| Reports/V1 cursor, week, pacing, lock | `finance_incremental_sync_state` |
| Run audit and heartbeats | `sync_runs`, `commercial_sync_ticks` |
| Account lock | `marketplace_accounts.sync_lock_expires_at` |
| Inventory snapshots | `historical_inventory_snapshots` |

No new lock table was added. Existing protection is sufficient for an hourly
single-runner schedule: the Actions concurrency group serialises runs, and inside
a run `assertSyncNotRunning` plus the finance state lock prevent double
execution.

One known limitation, unchanged by this work: the account lock is acquired with a
plain `UPDATE`, not a compare-and-swap, so two *simultaneous* writers could both
acquire it. That cannot happen with a single serialised scheduler, but it would
need a conditional acquire before running two workers in parallel.

## Failure and retry

| Situation | Behaviour |
|---|---|
| WB 429 | No inline retry storm. Server `Retry-After` / reset is recorded, the cursor stays put, the loop stops, the next wake honours the pacing gate |
| Network / 5xx | Bounded in-request retries from `execution-bounds.ts`; never unbounded |
| Persistence fails | Cursor is **not** advanced. The same page is re-fetched next wake |
| Budget exhausted | Remaining work is skipped, not failed |
| One account throws | Isolated; other accounts continue |
| Missing secret | `WorkerConfigurationError`, exit `20` |

The rule underneath all of it: **the Reports/V1 cursor advances only after a
successful persist.** Verified offline by cases C, D and E of
`verify:sync-worker`, and by the pre-existing
`npm run verify:finance-incremental`.

## Observability

Each run emits JSON lines to the Actions log with an `executionId`. Per account
and entity you get: outcome, entity statuses, rows fetched, rows persisted,
finance cursor before and after, rate-limit flag, and duration. `--print-summary`
adds a human-readable block at the end.

Failure notification uses GitHub's built-in workflow failure email. No paid
monitoring was added.

## Inventory scheduler

Production inventory continuity belongs to the worker, via the `inventory` task.

`src/services/inventory-snapshot-continuity-scheduler.ts` now exists in `HEAD`
(committed with the Sprint 10.7 worker dependencies), so the guard is what keeps
the web process timer-free: the scheduler is **off by default in production** and
requires an explicit `INVENTORY_SNAPSHOT_SCHEDULER=1`. Local development is
unchanged, so `npm run dev` still captures snapshots.
`verify-production-data-plane.mjs` asserts that guard.

On Netlify, leave `INVENTORY_SNAPSHOT_SCHEDULER` unset. The workflow sets it to
`0` so a worker run can never start a timer either.

### Historical inventory retention

**Automatic historical inventory retention purge is disabled by default and is
not part of the initial production worker execution.**

`purgeExpiredInventorySnapshots` issues a hard `DELETE` on
`historical_inventory_snapshots`. It is retained as a domain capability but is
fail-closed in two independent places:

1. `runInventorySnapshotContinuityForAccount` only calls it when the caller
   passes `retentionPurge`. No automatic path does — not the worker task, the
   continuity scheduler, the dashboard-sync backup, the warehouse orchestrator,
   nor the API route.
2. The function itself deletes nothing unless it receives an explicit
   `{ authorized: true, approvedBy }`. Omitted or malformed authorization
   returns `0` without issuing any statement, so a missing configuration can
   never fail open.

Snapshot capture and persistence are unaffected; only deletion is gated.

`warehouseHistoryDays` (default `90`) is deliberately left as-is. While the purge
is disabled the value is inert — it is reported in continuity state and logs but
drives no deletion. **Choosing the real retention window is a separate decision
that needs explicit approval**, and enabling the purge is a code-level change,
not a configuration toggle, so it cannot be switched on by an environment
variable in production. `verify:inventory-retention-safety` executes these paths
for real and fails if any of them starts deleting.

## Platform cron

`vercel.json` still declares an hourly cron for
`/api/sync/commercial-continuity`. It is **legacy** and inert on Netlify.

- Keep it while the Vercel deployment exists, as a fallback.
- Once production is on Netlify with the worker running, delete it — otherwise
  two schedulers drive the same tick. They will not corrupt data (the account
  lock and cursor rules hold), but they double WB quota consumption.
- `/api/sync/commercial-continuity` itself stays. It is still useful for manual
  operator triggers.

## Verification

```bash
npm run verify:worker-readiness        # preflight gate: can the worker run at all?
npm run verify:production-data-plane   # WB boundary: 0 on read plane, allowed in worker
npm run verify:sync-worker             # worker behaviour: isolation, cursor, 429, config
npm run verify:warehouse-db-only-10-6  # pre-existing warehouse-only regression
npm run verify:finance-incremental     # pre-existing cursor / 429 spec
npm run verify:commercial-continuity   # pre-existing continuity kernel
npm run verify:inventory-retention-safety  # no automatic DELETE of inventory history
```

`verify:production-data-plane` resolves each entrypoint's transitive static
import graph rather than grepping, and additionally executes the page-load data
modules under a fetch interceptor. `verify:sync-worker` drives the real
orchestrator with injected fake kernels, so isolation and cursor rules are
executed, not pattern-matched. Both share the resolver in
`scripts/lib/import-graph.mjs`, so they cannot disagree about what "reaches WB
HTTP" means.

## Cost

Hourly runs are 24/day, about 730/month. Billable minutes are rounded up per job.

| Case | Minutes per run | Per month |
|---|---|---|
| Typical tick (checkout, `npm ci` cached, preflight, little work due) | ~4 | ~2,900 |
| Worker uses its full 25-minute budget | ~28 | ~20,400 |
| Job hits the 35-minute timeout every run | 35 | ~25,600 |

Assumptions: `ubuntu-latest` standard runner, ~3 minutes of setup overhead per
run, no matrix. Whether these fit at no cost depends on repository visibility and
the account's plan, which are not derivable from this repository — check
**Settings → Billing** before enabling the schedule. If the typical figure is too
high, the lever is the cron frequency: every three hours cuts it to a third
without changing worker behaviour, because each tick resumes from the durable
cursor.
