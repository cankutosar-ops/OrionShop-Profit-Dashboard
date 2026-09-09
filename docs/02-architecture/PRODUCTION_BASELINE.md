# Production Baseline

---

Status

Accepted

---

Owner

Platform Architecture

---

Audience

- Developers
- AI Assistants
- Product Owner

---

Module

Cross-cutting

---

Category

architecture

---

Dependencies

- [ADR-016 — Finance Reports/V1 Incremental Sync](../06-decisions/ADR-016-finance-reports-v1-incremental-sync.md)
- [Historical Data Warehouse Platform](./HISTORICAL_DATA_WAREHOUSE_PLATFORM.md)
- [Production Sync Worker](./PRODUCTION_SYNC_WORKER.md)
- [Commercial Data Continuity](./COMMERCIAL_DATA_CONTINUITY.md)
- [Database RLS](./DATABASE_RLS.md)
- [Authorization](./AUTHORIZATION.md)

---

Related Documents

- [Production Checklist](../08-release/PRODUCTION_CHECKLIST.md)
- [Reporting Architecture](./REPORTING_ARCHITECTURE.md)

---

Related ADRs

- ADR-016 (sync)

---

Related Widgets

—

---

Version

1.0.0

---

Last Updated

2026-09-09

---

Review Frequency

Before every production activation or deployment change

---

Source of Truth

This file, for the *existence and intent* of each locked rule. The cited code,
migration or verification script remains the source of truth for its *behaviour*.

---

Purpose

Record the architectural, accounting, security, warehouse, sync, retention and
deployment rules that were established deliberately over prior sprints, together
with the commit that created each one and the test that defends it.

Several of these rules were introduced to close a specific production incident or
near-miss. They look like ordinary implementation details and are therefore easy
to "simplify" away during a refactor. This document exists so that any future
change to them is a conscious decision rather than an accident.

---

Scope

The whole repository as of `7e65909` on `feature/sprint-3-company-marketplace`.
This is a baseline record, not a task list. Open items are listed under
*Deferred decisions* with their blocking condition.

---

## How to read this document

Each rule carries the same five fields:

| Field | Meaning |
|---|---|
| Rule | The invariant, stated so it can be checked |
| Why | The problem that made it necessary |
| Origin | Commit or migration that introduced it |
| Guard | The test or constraint that fails if it is broken |
| Status | ACTIVE / ACTIVE-UNPROVEN / PENDING |

`ACTIVE-UNPROVEN` means the rule is implemented and its offline guard passes, but
the guard cannot yet observe real data, so the rule is not demonstrated in
production.

---

## 1. Locked rules

These are the rules that must survive any refactor. Removing one is a
regression even when the code around it changes shape.

### L1 — One accounting engine

**Rule.** `src/lib/profit-engine-model-b.ts` (exported through
`@/lib/financial-engine`) is the only place that turns warehouse rows into
profit. Reporting modules aggregate and present its output; they do not
re-derive it.

**Why.** Two engines drift. Once a report computes its own net profit, the
dashboard and the Excel export disagree and neither can be trusted.

**Origin.** Financial Engine V4, consolidated through Sprint 6.36 (`752d834`).

**Guard.** `verify:warehouse-db-only-10-6`, plus the `CALCULATION_MODEL`
constant in `src/lib/reporting/section-utils.ts:10`, which names the engine that
every report section declares itself to be using.

**Status.** ACTIVE.

### L2 — The read path never calls Wildberries

**Rule.** A user request — page render, API read, report build, Excel export —
resolves entirely from Supabase. Only the sync worker and recovery scripts hold
a Wildberries HTTP client.

**Why.** This is the rule the whole deployment rests on. WB endpoints are
rate-limited to as little as one request per minute; a page that called them
would be slow, would fail under concurrency, and would burn quota the ingestion
path needs.

**Origin.** Warehouse-only certification, Sprint 10.6.

**Guard.** `verify:production-data-plane`. It is not a text search: it resolves
each entrypoint's transitive static import graph through the `@/` alias and asks
whether any reachable module constructs a WB client. A file that merely mentions
a WB symbol cannot fool it, and a new import that reaches one cannot hide from
it. 12 assertions, currently passing.

**Status.** ACTIVE.

### L3 — Advancing a cursor requires a successful persist

**Rule.** The Reports/V1 ingestion order is fixed: HTTP → parse → normalise →
UPSERT `wb_finance` → verify persistence → *only then* advance `rrdId`.

**Why.** The reverse order loses a page permanently on any crash or 5xx between
the two steps, and the loss is silent because the cursor claims the page was
read.

**Origin.** ADR-016 §1, §7, §9.

**Guard.** `verify:finance-v1-migration` (92 assertions),
`verify:account1-reports-v1` (30 assertions).

**Status.** ACTIVE.

### L4 — Destructive inventory purge is opt-in and fail-closed

**Rule.** No automatic path deletes historical inventory snapshots.

**Why.** `purgeExpiredInventorySnapshots` issued a hard `DELETE` on
`historical_inventory_snapshots` and was reachable from five automatic callers
including the hourly worker. No retention policy has been approved. The first
production run would have destroyed every snapshot older than 90 days, and
inventory history cannot be re-derived from any Wildberries endpoint.

**Origin.** `15c23c5`.

**Guard.** `verify:inventory-retention-safety` (24 assertions). It runs the real
purge function against a fake PostgREST server and the real continuity service
and worker task, so it observes whether a `DELETE` actually reaches the wire
rather than trusting the source to look safe.

**Status.** ACTIVE. Verified twice over, independently:

- `src/services/inventory-snapshot-continuity-service.ts:88-90` — the purge runs
  only when the caller passes `retentionPurge`, and no automatic caller does.
- `src/services/inventory-daily-snapshot-service.ts:671-673` — the function
  itself returns `0` without issuing any statement unless it receives
  `{ authorized: true, approvedBy }`.

### L5 — Test tenants are classified by identity, never by emptiness

**Rule.** Accounts 3 and 4 ("Verify Flow Test", "Verify Flow Test 2") are
excluded from data-completeness auditing through
`isOperationalMarketplaceAccount` — the same predicate that decides which
accounts appear in the production scope selector.

**Why.** The tempting shortcut is to infer "not a real account" from "has no
rows". That heuristic reports PASS at exactly the moment it matters least: if a
real account ever lost its finance data, it would be silently reclassified as
"not onboarded" instead of failing.

**Origin.** `b143af3`.

**Guard.** `verify:finance-weekly-completeness` asserts both that every
operational account was covered and that no excluded account secretly holds
data. `ORION_PRODUCTION_ACCOUNT_IDS` overrides the predicate when needed.

**Status.** ACTIVE. Confirmed against production: A3 and A4 hold 0 rows in both
`wb_finance` and `wb_sales`.

---

## 2. Accounting rules

The canonical formulas, as implemented in `src/lib/profit-engine-model-b.ts:14-20`
and verified line by line against the running code:

| Quantity | Formula | Code |
|---|---|---|
| Sales | Σ `priceWithDisc` | `params.netSales` |
| Marketplace Fee | Sales − Sales API `forPay` | `:63` |
| Revenue | Σ Finance `ppvz_for_pay` | `:64` |
| Estimated Tax | Tax Rate × Σ `finishedPrice` | `:74` |
| Net Profit | Revenue − Product Cost − Logistics − Storage − Acceptance − Penalties − Other − Advertising − Estimated Tax | `:77-87` |

### A1 — Marketplace Fee is informational, not a deduction

**Rule.** Marketplace Fee is reported but never subtracted inside Net Profit.

**Why.** Revenue is `ppvz_for_pay`, which Wildberries has *already* reduced by
the commission. Subtracting the fee again double-counts it and understates
profit by the full commission.

**Guard.** The line item is labelled in code: "Marketplace Fee (informational) —
not deducted again in Net Profit" (`profit-engine-model-b.ts:247-249`), repeated
in `src/types/database.ts:393`.

**Status.** ACTIVE. This is the single most inviting "bug fix" in the codebase —
a reviewer who sees a fee that is computed but not subtracted will want to
subtract it. It is correct as written.

### A2 — `finalNetProfit` is the after-tax figure

**Rule.** `netProfit` and `operatingProfit` are the *pre-tax* aliases;
`finalNetProfit` is Net Profit as defined above.

**Why.** Smart Pricing and older operational call sites depend on the pre-tax
value, so both are exposed. Every user-facing surface must read `finalNetProfit`.

**Guard.** Documented at `src/types/database.ts:377-395` and `:668-670`. Audited
across the codebase during this review: the dashboard grouped table, executive
summary, brand and category profitability, financial ratios, product report
providers and the P&L page all read `finalNetProfit`. No user-facing surface
reads the pre-tax alias.

**Status.** ACTIVE.

### A3 — Estimated Tax uses two different bases, deliberately

**Rule.** Historical reporting taxes Σ `finishedPrice`. Smart Pricing taxes
`Sale Price − Marketplace Fee`. These must not be unified.

**Why.** They answer different questions. Reporting asks what tax was incurred
on completed sales; Smart Pricing solves for the price that achieves a target
profit and must model the tax the seller will owe on a hypothetical sale.

**Origin.** `.cursor/rules/estimated-tax-dual-model.mdc`, which exists precisely
because this looks like an inconsistency to anyone encountering it for the first
time.

**Status.** ACTIVE.

### A4 — `deliveryService` is money; `deliveryAmount` is a count

**Rule.** In Reports/V1 detailed rows, `deliveryService` maps to `delivery_rub`.
`deliveryAmount` must never be treated as roubles.

**Why.** Not mapping `deliveryService` silently drops logistics cost from the
P&L, which overstates profit. Mapping `deliveryAmount` instead would post a unit
count as a rouble amount.

**Evidence chain**, assembled during the 2026-09 YTD audit:

1. `normalizeFinanceV1DetailedRow` in `src/lib/wildberries/finance-v1.ts` maps
   `deliveryService → delivery_rub` and leaves `deliveryAmount` unmapped.
2. Live sample `exports/_ytd2026-probe-2026-05-21_2026-05-27-sample-row.json`
   shows `deliveryService: "223.91"` alongside `deliveryAmount: 1` — a
   decimal-valued string next to a unit integer.
3. Aggregate probe data shows `deliveryAmount` summing to small integers across
   the window, consistent with a count and not with a currency total.
4. Wildberries' own `sales-reports/list` response exposes `deliveryServiceSum`
   as the period control total — a *Sum* over the `deliveryService` field,
   confirming it is the monetary one.

**Guard.** `verify:finance-v1-migration` asserts both directions:
`deliveryService` carrying money produces a logistics line, and `deliveryAmount`
is never used as roubles.

**Status.** ACTIVE. Two stale artefacts contradicted this and were corrected
rather than followed: a test assertion expecting `delivery_rub` to be null, and
a self-contradictory note in `src/lib/finance-recovery/reports-ingestion.ts`
(fixed in `7e65909`). A third remains — see D4.

---

## 3. Data warehouse rules

### W1 — The one-way pipeline

```
WB API → Sync / Recovery → Supabase warehouse → Financial Engine → Reporting / Dashboard
```

Data flows one way. The right-hand side never reaches back to the left.

**Guard.** `verify:production-data-plane`, described in L2. It also asserts the
converse — that the sync worker *does* reach a WB client — so the rule cannot be
satisfied by accidentally disconnecting ingestion.

**Status.** ACTIVE.

### W2 — Ingestion is idempotent through `source_key`

**Rule.** Every warehouse write is an UPSERT keyed on
`(marketplace_account_id, source_key)`. No ingestion path issues `DELETE` or
`TRUNCATE`.

**Why.** Re-reading a window is the only correction mechanism available:
Wildberries offers no cursor for advertising, and finance weeks can be restated
after publication. Idempotent upserts make re-reading free and make an
interrupted run safe to repeat.

**Origin.** ADR-016 §4, §12; `f6ccf89` for advertising.

**Status.** ACTIVE.

### W3 — Every warehouse table is account-scoped

`wb_finance`, `wb_orders`, `wb_sales`, `wb_stock`, `historical_inventory_snapshots`
and product cost tables all carry `marketplace_account_id`. `wb_ads` carries it
in code and in the pending migration — see D1.

**Status.** ACTIVE, except `wb_ads` which is PENDING.

---

## 4. Security rules

### S1 — Tenant scope is validated before any warehouse query

**Rule.** `?account=` and `?company=` arrive from the URL and are untrusted.
Server pages resolve them through `requirePageScope`, API routes through
`authorize`; both consult one shared rule table, `decideTenantScope`. An
unauthorised claim redirects to `/access-denied` and never reaches the data
layer.

**Why.** Server pages previously resolved these parameters *without* a
membership check while API routes did check. Combined with the service_role data
plane (S2), that let URL tampering render another tenant's warehouse data as
HTML.

**Origin.** `d4943a9` — a P0 fix.

**Status.** ACTIVE. This is currently the *primary* isolation control, not a
secondary one. See S2.

### S2 — The application runs on the service_role data plane

**Rule, as currently configured.** `ORION_RLS_DATA_PLANE` is not set, so
`createServerClient()` returns the admin (service_role) client for user requests
— `src/lib/supabase/server.ts:66-73`. Service role bypasses RLS.

**Consequence.** Database-level RLS is *not* the control that isolates tenants
in the running application. Application-layer authorization (S1) plus explicit
`marketplace_account_id` filters are. RLS is defence in depth that is presently
switched off.

**What is actually in the database.** The RLS migrations *are* applied and they
*do* work. `verify:rls-7-1-d` run against production confirms: anonymous SELECT
and INSERT denied; cross-tenant SELECT returns no rows; cross-tenant INSERT
rejected by policy; `api_key_encrypted` unreadable by `authenticated`;
`marketplace_accounts_public` carries no ciphertext column.

**Why it is still off.** The fallback comment records the reason —
"Until the 7.1.D SQL migration is applied, keep service_role so the app boots."
The migration has since been applied, so the flag is now switchable; flipping it
changes the data plane for every query at once and therefore needs its own
verification pass rather than being bundled into a release.

**Status.** ACTIVE as designed, but this is the most consequential open item in
the audit. See D2.

### S3 — Residual permissive read policies must stay dropped

**Rule.** The `dashboard_read_anon_auth` policies (`USING (true)`) created in
`20260623170003` are dropped on every tenant table.

**Why.** RLS policies are permissive and OR'ed together. A single leftover
`USING (true)` policy would let any authenticated user read every tenant's rows
the moment `ORION_RLS_DATA_PLANE=1` is enabled — silently converting the
defence-in-depth upgrade into a data breach.

**Origin.** `20260908120000_rls_drop_residual_dashboard_read_policies.sql`, which
drops the policy only where a tenant-scoped replacement already exists.

**Status.** ACTIVE. This rule is dormant today (S2) and becomes load-bearing the
instant D2 is actioned. It must be re-verified as part of that change, not
before it.

### S4 — Per-account WB credentials never enter CI

**Rule.** Wildberries API keys live encrypted in
`marketplace_accounts.api_key_encrypted` and are decrypted at runtime with
`MARKETPLACE_CREDENTIALS_KEY`. They are not GitHub Actions secrets.

**Why.** One key per account, held in one place, means adding an account is a
data operation rather than a CI configuration change, and a CI compromise
exposes the decryption key only in combination with database access.

**Origin.** `.github/workflows/sync-worker.yml:60-62`.

**Status.** ACTIVE. The worker additionally redacts known secret values and
token-shaped strings before writing any log line.

---

## 5. Sync rules

### Y1 — Reports/V1 migration is per account, and requires two switches

**Rule.** An account uses the Reports/V1 finance kernel only if it appears in
`FINANCE_V1_ACCOUNT_IDS` *and* `FINANCE_V1_LIVE_REQUESTS_ENABLED` is true.
Account 2 predates the allowlist and is on V1 unconditionally, checked first.

**Why.** `FINANCE_V1_LIVE_REQUESTS_ENABLED` is a single global switch. Using it
alone to migrate one account would move every account simultaneously, including
the two test tenants — and an account with no seeded
`finance_incremental_sync_state` row returns `idle / awaiting_completed_weeks_anchor`
from the planner. That account would stop ingesting finance entirely, reporting
success, with no error anywhere. A silent stop is far worse than a loud failure.

**Origin.** `c18b16c`.

**Status.** ACTIVE.

### Y2 — An account routed to V1 without an anchor fails loudly

**Rule.** If the planner returns `awaiting_completed_weeks_anchor`, the
orchestrator reports `status: "failed"` with `finance_v1_missing_anchor`, not
`idle`.

**Why.** This converts the silent-stop path described in Y1 into a visible
failure. It is the backstop for the case where someone adds an account id to the
allowlist and forgets to seed it.

**Origin.** `4c587d7`, `src/lib/finance-incremental/orchestrator.ts`.

**Status.** ACTIVE.

### Y3 — V5 → V1 transition cannot duplicate rows

**Rule.** Switching an account between the Statistics V5 and Reports/V1 paths
never double-counts.

**Why it holds.** Both paths map through `mapFinanceRowsFromReport` and key on
`buildFinanceSourceKey(rrdId, suffix)`, producing `rrd:{rrdId}:{suffix}`.
Persistence upserts on `(marketplace_account_id, source_key)`, so a row V5
already wrote is updated in place rather than inserted again.

**Verified for Account 1 specifically.** A read-only probe of A1's 74,819
`wb_finance` rows found 100% of `source_key` values already matching the
`rrd:<number>:<suffix>` pattern. A V1 re-fetch of any overlapping week upserts
onto the existing rows.

**Status.** ACTIVE.

### Y4 — Account 1's anchor is seeded and consistent

Production state, read 2026-09-09:

| Account | Mode | Weeks | Last completed week | Rows |
|---|---|---|---|---|
| A1 | `idle` | 1 | `2026-08-24:2026-08-30` | 74,819 |
| A2 | `current_week` | 10 | `2026-08-24:2026-08-28` | 132,523 |

A1's anchor was derived from the last fully-covered Monday–Sunday week actually
present in `wb_finance`, so the first V1 run resumes at the correct boundary
rather than re-importing history or skipping a week. Neither account reports an
error. A2's state is untouched.

**Status.** ACTIVE, awaiting activation — see D3.

### Y5 — Finance quota is reserved for Account 2 recovery

**Rule.** `ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE` is fail-closed: unless it
resolves to an explicit boolean, the worker will not sync Account 2 finance.

**Why.** So a CI runner cannot compete with an operator's local historical
recovery campaign for the one-request-per-minute Reports quota.

**Origin.** `.github/workflows/sync-worker.yml:64-68`,
`src/lib/finance-recovery/reservation.ts`.

**Status.** ACTIVE.

### Y6 — One WB ingestion per hour, enforced by durable state

**Rule.** Two schedulers exist and they do not double-spend WB quota.

**The two paths.**

- Vercel cron: `GET /api/sync/commercial-continuity`, hourly at `:00`
  (`vercel.json`).
- GitHub Actions: `.github/workflows/sync-worker.yml`, hourly at `:20`, default
  tasks `commercial,inventory`.

**Why they do not collide.** Both call the *same* kernel,
`runCommercialContinuityTick({ force: false })`. Before touching Wildberries,
that kernel checks `entityDue()` against durable state in
`commercial_entity_sync_state` — `src/services/commercial-continuity-service.ts:146-160`
and `:383-402`. An entity is due only when
`elapsed ≥ intervalMinutes`, and the default interval is 60 minutes
(`DEFAULT_COMMERCIAL_SYNC_INTERVAL_MINUTES`). An entity synced at `:00` is 20
minutes old at `:20`, so the worker records `skipped_not_due` and issues no WB
request. `entityDue` additionally returns false while an entity's status is
`running`, which covers an overrunning tick.

The interlock is the shared durable state, not the 20-minute offset. The offset
is secondary protection, and the workflow says so: the schedule is offset "so it
does not collide with WB's own top-of-hour load or with any remaining platform
cron".

**Consequence worth knowing.** Because Vercel fires first, it wins the hour for
`commercial` in steady state. The GitHub worker's practical contribution is
`inventory`, which the Vercel cron does not run, plus `commercial` failover when
Vercel's tick fails. Both are load-bearing; neither is dead code.

**Status.** ACTIVE, with one configuration hazard — see R3.

### Y7 — Expensive tasks are opt-in

**Rule.** The default worker tick is `commercial,inventory` only.
`finance-catchup` and `ads` must be requested explicitly.

**Why.** `finance-catchup` consumes additional Reports/V1 quota, and
`/adv/v3/fullstats` permits only 3 requests per minute, so a wide advertising
window costs real wall-clock time and would threaten the 25-minute tick budget.

**Origin.** `src/worker/types.ts:20-29`.

**Status.** ACTIVE.

---

## 6. Inventory retention rules

Restating L4 with its operational detail, because this is the rule most likely to
be "cleaned up" by someone who notices a purge function that never runs.

| Invariant | Where |
|---|---|
| Automatic purge disabled by default | `inventory-snapshot-continuity-service.ts:88-90` |
| No DELETE without `{ authorized: true, approvedBy }` | `inventory-daily-snapshot-service.ts:671-673` |
| Worker default tick does not call purge | `src/worker/types.ts:26-29` |
| Snapshot capture and persistence continue normally | `captureDailyInventorySnapshot`, worker `inventory` task |
| `warehouseHistoryDays` stays 90 and is inert | read for reporting; drives no deletion |

**Current production data.** 30,221 snapshot rows spanning 2026-07-17 to
2026-09-09 — about 55 days. Nothing is older than the 90-day window *yet*, so a
purge today would delete nothing. That is a timing accident, not a safety
margin: the first rows cross the threshold in mid-October, at which point an
accidentally re-enabled purge would begin destroying history. The guard must be
in place before then, and it is.

Reactivating retention requires an approved policy, not a code change.

---

## 7. Deployment rules

### P1 — Clean checkout must build

**Verified at `7e65909`** in an isolated worktree with no inherited
`node_modules`:

| Step | Result |
|---|---|
| `npm ci` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |

**Why it is checked this way.** A clean checkout of `b143af3` had 18 TypeScript
errors and could not produce a production build. The working tree hid this,
because uncommitted WIP contained the fixes mixed with unrelated feature work.
`49f2431` committed the minimum production-required subset. Building in the
working tree is not evidence; building a detached checkout is.

### P2 — Worker execution contract

| Property | Value | Rationale |
|---|---|---|
| Schedule | `20 * * * *` | offset off the hour |
| Concurrency | group `sync-worker`, `cancel-in-progress: false` | cancelling mid-page abandons a held DB lock instead of releasing it; the cursor only advances after a successful persist, so waiting is always safer |
| Job timeout | 35 min | backstop above the 25-min worker budget |
| Worker budget | `--budget-ms 1500000` | bounded tick |
| Node | 22, `cache: npm` | |
| tsx | pinned exact 4.23.13, invoked `npx --no-install` | without `--no-install`, npx would silently fetch an unpinned tsx from the registry if the install regressed |
| Preflight | `verify-worker-production-readiness.mjs` | runs before the worker |
| In-process timer | `INVENTORY_SNAPSHOT_SCHEDULER=0` | never start a second scheduler inside a worker run |
| Exit codes | 10 retryable (durable state intact), 20 permanent misconfiguration | distinguishable in Actions notifications |

### P3 — Environment surfaces must agree

Finance routing is read from the process environment. The Vercel deployment and
the GitHub Actions workflow are two separate environments, and the workflow does
not currently pass `FINANCE_V1_ACCOUNT_IDS` or `FINANCE_V1_LIVE_REQUESTS_ENABLED`
at all.

Setting these in only one place produces split-brain ingestion: the same account
would use Reports/V1 under one scheduler and Statistics V5 under the other. Y3
means this cannot duplicate rows, so it is not a data-corruption risk — but it
makes behaviour depend on which scheduler happened to win the hour, which is not
a debuggable system.

Both surfaces must be set identically, in the same change.

---

## 8. Deferred decisions

### D1 — `wb_ads` migration is written but not applied

Migration `20260909090000` adds `marketplace_account_id`, `source_key`,
`campaign_id`, `updated_at`, an account-scoped RLS policy replacing the
transitive join through `products`, and the unique
`(marketplace_account_id, source_key)` index that serves as the upsert conflict
target.

**Confirmed not applied**, by direct read-only inspection of production:
`marketplace_account_id`, `source_key` and `updated_at` are absent from `wb_ads`.
The table holds 0 rows.

**Accounting consequence.** The Financial Engine deducts advertising as the sum
of `wb_ads.spend`. That sum is currently zero, so **Net Profit is overstated by
the entire real advertising spend** for every account and every period. This is
not a code defect — the ingestion path exists and its offline guards pass — it is
an unapplied migration.

**Note on the guards.** `verify:advertising-ingestion` (31 assertions) and
`verify:ads-account-isolation` (29 assertions) both pass, but the latter reports
its live half as "structurally sound but currently vacuous — `wb_ads` is empty".
A passing ads suite today does not demonstrate isolation against real data. It
will once the migration is applied and a backfill has run.

**Blocked on.** Database credentials to apply the migration. Per
`.cursor/rules/database-migration-protocol.mdc`, no backfill may run before the
schema is confirmed.

### D2 — `ORION_RLS_DATA_PLANE` is off

Discussed under S2. The RLS policies are applied and verified working; the
application does not use them because every user request runs as service_role.

Enabling the flag is a defence-in-depth upgrade, not a bug fix — S1 is a real
control and it is enforced. But it changes the data plane for every query
simultaneously, and S3 becomes load-bearing at the same instant, so it needs its
own verification pass.

One finding must be resolved first. `verify:rls-7-1-d` reports a single failure:

```
FAIL  Authenticated denied on sync_runs (service_role-only) — readable (bad)
```

`sync_runs` is readable by the `authenticated` role. Because Supabase's PostgREST
endpoint is reachable directly with a logged-in user's JWT, this is a live
cross-tenant read of sync metadata today, independent of the flag — not merely a
latent issue. It is metadata (run timings, account ids, error strings) rather
than financial data, so the severity is low, but it is a real leak and the fix is
one migration.

### D3 — Account 1 Reports/V1 activation

Code-ready and anchored (Y2, Y3, Y4); not activated. Activation is an
environment change only: add `1` to `FINANCE_V1_ACCOUNT_IDS` and set
`FINANCE_V1_LIVE_REQUESTS_ENABLED=true`, on **both** surfaces named in P3.

No code change is required, and none should be bundled with it.

### D4 — ADR-016 carries a stale constraint

ADR-016's *Negative / Constraints* section states "V1 logistics mapping remains
uncertain (`delivery_rub`)". A4 resolved that uncertainty.

This is deliberately **not** edited here. The ADR lifecycle in
`docs/06-decisions/INDEX.md` states that Accepted ADRs are not edited to change
their content — a superseding or amending record is written instead. The stale
line is recorded here so it is not mistaken for a live constraint, and so that
nobody "restores correctness" by reverting the A4 mapping to match the ADR.

Two of the three artefacts that contradicted A4 have been corrected. This is the
third, and it should be closed by an ADR amendment.

---

## 9. Regression risks

Ranked by how plausible the mistake is, not by blast radius alone.

| # | The change that looks correct | What it would actually break |
|---|---|---|
| R1 | Subtracting Marketplace Fee inside Net Profit, because it is computed but never deducted | Double-counts the commission; Revenue is already net of it (A1) |
| R2 | Deleting the Vercel cron as "legacy", since a GitHub worker exists | Removes the path that actually performs `commercial` sync in steady state (Y6) |
| R3 | Lowering `commercialSyncIntervalMinutes` for fresher data | The interlock in Y6 is the 60-minute interval. The setting accepts values down to 15. At any value ≤ 20 minutes, both schedulers become due and WB quota is spent twice per hour |
| R4 | "Simplifying" the purge authorization object, or re-enabling retention because 90 days seems reasonable | Destroys unrecoverable inventory history from mid-October (L4) |
| R5 | Reverting the `deliveryService → delivery_rub` mapping to match ADR-016's stale note | Silently drops logistics cost from the P&L (A4, D4) |
| R6 | Unifying the two Estimated Tax bases during a refactor | Breaks either historical reporting or the price simulator (A3) |
| R7 | Enabling `ORION_RLS_DATA_PLANE=1` without re-verifying S3 | A single surviving `USING (true)` policy exposes every tenant to every authenticated user |
| R8 | Setting `FINANCE_V1_ACCOUNT_IDS` on one deployment surface only | Split-brain ingestion (P3) |
| R9 | Inferring test tenants from row counts instead of identity | A real account that loses data is silently reclassified and reports PASS (L5) |
| R10 | Deleting `scripts/verify-*` scripts that "only test fakes" | These are the only executable record of most rules here; `ARCHITECTURE_RULES.md` is an empty skeleton |

---

## 10. Documentation debt

`docs/07-development/ARCHITECTURE_RULES.md` is a metadata skeleton with `TODO`
in every content field. The rules it should contain are real and enforced, but
they live in commit messages, verification scripts and code comments.

That distribution is why this baseline exists, and it is also why R10 matters: a
verification script deleted here is a rule lost, because no prose copy exists to
restore it from.

---
