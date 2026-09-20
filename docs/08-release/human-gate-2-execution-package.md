# Controlled first production release — execution package

Prepared 2026-09-20 from application baseline `fb83a1862c76a82d14f93dd3a865370ec8595ad8`, plus the schedule opt-in guard accompanying this document. Freeze the final pushed feature SHA before execution. **NOT EXECUTED.** This document is not approval. Production project: `mdiqspjvmekyngmiehqk`. No Vercel deployment exists in the evidenced topology; its repository configuration stays dormant.

## Gate 1 status and single human action card

Safe preparation is complete. Gate 1 remains open solely for Netlify control-plane access: the available browser reaches the Netlify login page, not an authenticated team. No local Netlify CLI login or site link was found. An active owner account does not prove the agent can access its team or import this repository.

Owner action now: sign in to the opened Netlify page and select/identify the intended team. Do not import, grant GitHub app access, create a site or press Deploy yet. Once access is visible, verify that the team can create a project and connect the specific GitHub repository. All creation, secret writes, OAuth repository grants, merge, deployment and Auth changes remain in Gate 2 below. Do not send passwords, tokens or key values in chat.

At Gate 2, use the one Netlify procedure under L/M; no Vercel UI confirmation is required. A dedicated INTERNAL_API_SECRET will be provisioned then. The beta recipient and exact company/account assignment are required only before T; do not infer them from Account 1's finance allowlist.

## Evidence already available

- Netlify contract: Node 22, Next 15.5.19 App Router, `npm run build`, `.next`, automatic OpenNext. SSR/API routes and middleware require generated Functions/Edge acceptance on the real host. No custom start command, static export or legacy adapter. See [environment contract](netlify-environment-contract.md).
- Prior isolated Node 22.23.2 strict production build and TypeScript passed; synthetic private markers were absent from 154 browser assets. This proves the tested build/import boundary, not arbitrary future changes or the not-yet-generated Netlify package. Repeat the same boundary check against deployed assets before beta.
- GitHub authenticated reads report admin access and Actions public-key retrieval; write permission is not mutation-tested. Secrets/variables were absent at the inspection. No writes were used as a permission probe.
- Both production account credentials authenticated-decrypted in memory with the current local service-role fallback. Use that exact legacy value as explicit MARKETPLACE_CREDENTIALS_KEY on both hosts. No rotation, new encryption key, credential re-encryption or token disclosure.
- Both local public anon and service keys were accepted by Auth settings (HTTP 200). Finance policy is approved: live requests `true`, account allowlist `1`, Account 2 historical recovery `false`. The account IDs are bigint values, not UUIDs.
- Backup `2026-09-19T141436Z` restored into isolated local `orionshop_restore_verify_20260919`: public catalog and counts matched, integrity violations zero. Scope excludes Auth/Storage/platform secrets; it is not full platform disaster recovery. It is not assumed current on September 20.
- Four production migrations remain unapplied; broad read policies remain a pre-release security blocker. Financial Engine V4 is unchanged.
- This package's Node 22 worker production-readiness verifier passed with zero failures/skips, including the new schedule opt-in assertion and typechecking 104 worker modules. Migration hashes matched and Git whitespace checks passed. No application TypeScript changed; the prior full production build/typecheck remains the web-build baseline.

## Execution order, evidence and stop discipline

Run B before A so the backup is taken during quiescence; then C through T. Keep an operator log with UTC time, release SHA, hashes, sanitized counts, validations and each checkpoint. No secret-bearing URLs, dumps, tokens or raw user data go in Git or chat. A failed check halts dependent steps; it does not authorize a bypass or destructive restore.

### A — fresh logical recovery point

Action: after B, create a fresh public schema/data backup unless a count/catalog and writer-history check proves the verified September 19 point unchanged. When uncertain, make a fresh one. Follow [backup/restore procedure](local-logical-backup-recovery.md), recording source counts before/after both dumps and SHA256s. Restore to a NEW local Docker database; never restore to the linked production project.

Expected/validate: clean ON_ERROR_STOP restore, matching catalog/grants/policies/counts, zero account or identity violations. Retain the previous backup too. STOP on changed source during capture, incomplete dump or failed restore. Hold all writers; no production restore or delete is authorized by this package. Record ledger definitions separately if present, since the public dump excludes the migration schema. Auth settings and secret source references require a separate configuration change record without secret values.

### B — writer quiescence

Action: owner/operator stop local dev servers, inventory timers, manual sync routes/CLI, backfills and recovery campaigns. In GitHub set `SYNC_WORKER_SCHEDULE_ENABLED=false` in the approved window; verify no queued/running worker. No Netlify site or Vercel cron currently needs a handover. Inspect any newly evidenced external writer before proceeding.

Expected/validate: no active finance lease or unfinished sync/commercial tick/entity, no new heartbeat or data change between two read-only observations at least five minutes apart. Use the existing local `.audit/gate0-production-writer-readonly.sql` and process inventory; database silence alone is not proof that an external timer is stopped. STOP if writer ownership is unknown, activity continues or a recovery campaign owns Account 2. Hold rather than clearing locks/cursors. Do not force-kill a transaction to manufacture quiescence.

### C — fresh catalog, policy and file freeze

Action: read catalog/ledger and capture per-account counts and finance aggregates, legacy stock and snapshot counts. Compare to rehearsed definitions and confirm the three residual broad policies alongside their tenant/service counterparts. Check all four hashes below and freeze feature/main SHAs. Confirm expected schema prerequisites and zero duplicate source identities.

Expected/validate: no unexplained drift; ledger absent or exactly understood. STOP on changed migration bytes, unknown ledger entry, active writer or catalog/policy mismatch. Hold before metadata repair. Local catalog evidence is in `.audit/gate0-production-catalog-2026-09-19.json`; these private artifacts are operator inputs, not committed exports. Missing inputs must be regenerated read-only.

Frozen migration SHA256s:

- `20260917110000_contain_residual_tenant_read_policies.sql`: `A26E9707D34239B8CA5B1A2B6C8339DDFEC34E9A69D3ECE12D704549F450FD26`
- `20260917120000_finance_incremental_atomic_lease.sql`: `9D964796A3487BBA486C4AF96EC79F741B97F08FBF71FBABE8B79CA6F03C9D7C`
- `20260917130000_wb_current_prices.sql`: `516A8699516B151A1289C23B71739B9DCF72371BD6BF6BC2F401A194D4A8A8BA`
- `20260917140000_wb_canonical_current_stocks.sql`: `6EDC635C2045325A029202042D7C13CDB684A425BD67C8C53038A69C7708D939`

### D — conditional ledger metadata reconciliation

Action: approve only these seven versions after fresh postcondition proof: `20260624120000` (finance srid/index), `20260712180000` (sales price columns), `20260712200000` (order price/date/index), `20260720170000` (sales warehouse/index), `20260726160000` (snapshot transit columns), `20260731120000` (invoice number), `20260909110000` (nonpartial ads account/source unique arbiter). Match exact types/defaults/nullability/index predicates against the SQL, not names alone. Rehearse metadata repair on the local restored clone first.

Execute one version at a time with the verified Supabase 2.117.0 CLI: `supabase migration repair VERSION --status applied --linked`. Verify the linked ref before every invocation. This changes ledger metadata only; never replay historical SQL. Read `SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;` after each operation.

Expected/validate: precisely the seven proven baseline entries, once each, unchanged business counts/aggregates. Exclude `20260629120000` and `20260911100000`; never replay destructive `20260710120000`. STOP on unproven history or changed business data. An incorrect ledger mark requires review before a metadata-only `--status reverted`; it does not undo SQL. Never use blind `db push` or bulk migration-up with unreconciled history.

### E–H — apply four migrations individually

Common action: use a protected PostgreSQL session with credentials outside command arguments/logs (PG connection environment/passfile from the authorized operator). First verify the connection resolves to the approved production ref. For each file run `psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/FILE.sql`; each reviewed file supplies its own transaction. Do not combine the four files. Inspect result and validate I before the next. Only after successful commit and validation, record THAT version with the same metadata repair command in D and verify the ledger.

E: apply `20260917110000_contain_residual_tenant_read_policies.sql`. Expected: only dashboard_read_orders, dashboard_read_sales and dashboard_read_costs broad policies removed; tenant/service policies retained. Validate `scripts/verify-rls-broad-read-containment-catalog.sql` plus tenant-role probes. STOP on access leakage or loss of intended service/tenant access. Hold readers/writers if needed; never restore broad USING(true) policies as a convenience rollback.

F: apply `20260917120000_finance_incremental_atomic_lease.sql`. Expected: expiry column, four lease/page RPCs, service-only execute, unchanged financial rows/cursors. Validate function signatures, grants, unique account/source arbiter and counts. Concurrency/fencing behavior is proved on local fixtures, not by mutating production locks to test. STOP on function/privilege mismatch. Leave additive schema in place and workers off; do not start old/new workers together.

G: apply `20260917130000_wb_current_prices.sql`. Expected: empty durable current-price table, account/nm identity, price constraints and service-only RLS/grants. Validate exact definitions and zero initial rows. STOP on tenant exposure, missing constraints or unexpected rows. Hold price producers; do not use marketplace price as Product Cost or rewrite historical financial facts.

H: apply `20260917140000_wb_canonical_current_stocks.sql`. Expected: empty current-stock relation/index/RPC preserving account/product/warehouse/variant/barcode grain, with tenant reads and service writes. Validate definitions and unchanged legacy/history counts. STOP on changed historical inventory or identity mismatch. Keep `ORION_CURRENT_STOCK_SOURCE=legacy`; no population occurs in the schema gate.

### I — validation after each database gate

Action: run the relevant section of `scripts/verify-release-forward-schema-readonly.sql` after F/G/H and the full script at completion. Check returned rows/definitions, not merely SQL exit status: required functions/relations must exist and privilege booleans must match comments. Compare financial counts/aggregates, legacy stock, snapshots and costs to C after every gate. Run rolled-back local role probes for anonymous, own-company/account, foreign-company and same-company foreign-account access; production probes use existing controlled sessions only, no new test data/users.

Expected: no business-data mutation, all expected security boundaries, baseline seven plus four actually executed ledger versions. STOP on mismatch, including missing role-test evidence. Hold at last validated additive checkpoint. A failed transactional SQL apply rolls back itself; a committed migration with failed validation is held for diagnosis, never automatically down-migrated or marked successful.

### J — GitHub production configuration

Action: Settings → Secrets and variables → Actions → Secrets → New repository secret for SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, MARKETPLACE_CREDENTIALS_KEY. Use secure in-memory stdin transfer described in the environment contract or enter directly in GitHub UI. Preserve the proven legacy encryption value. Set repository Variables to the three approved finance values and `SYNC_WORKER_SCHEDULE_ENABLED=false`.

Expected/validate: four secret names and update timestamps, exact nonsecret variables, no run started. Recheck Account 2 reservation false matches no active campaign; completed historical weeks do not imply fresh current data. STOP on denied configuration access, unknown key source, decryption failure or new quota owner. Keep schedule false, no manual dispatch; do not rotate keys as a fix.

### K — feature to main

Action: refresh remote refs, record reviewed feature SHA, require clean isolated checkout and all applicable tests/checks, compare final diff, then merge the reviewed feature into main through the repository's required merge procedure. No force push. This package's schedule opt-in guard must be present in the resulting main workflow.

Expected/validate: main contains reviewed release and all four migration files, schedule flag false; zero worker execution. STOP on conflicts, unexpected main changes, failed checks or a missing guard. Hold main release/deployment and do not enable schedule. Reverting code, if required, must retain compatibility with additive schema; never reverse data migrations automatically.

### L — one Netlify first-site setup (Gate 2 only)

Action: in the verified owner team choose Add new project → Import an existing project → GitHub. Grant access only to `cankutosar-ops/OrionShop-Profit-Dashboard`; select repository, production branch `main`, base repository root, build `npm run build`, publish `.next`, Node 22. Review detected `netlify.toml`, automatic OpenNext and resolved adapter version. Do not add a static export/start command/SPA redirect. Set production environment from the contract BEFORE the first build; server secrets scoped to Functions/runtime, public values to Builds and runtime. Ensure middleware receives its required runtime configuration. No production secrets in branch deploys or previews. Disable those deployment contexts or leave them without production access.

Provision a distinct INTERNAL_API_SECRET through secure secret handling; preserve the existing MARKETPLACE key. Initial flags: RLS data plane 1 after E/I, stock legacy, inventory scheduler 0, three approved finance values. Choose/record the real site name/HTTPS origin before building when UI permits; set NEXT_PUBLIC_APP_URL accordingly. If the origin is assigned only at creation, hold user acceptance until M and a rebuild with the actual origin. Do not invent a hostname in advance. Press Deploy only within this approved gate.

Expected/validate: build SHA matches main; SSR/API Functions and middleware Edge artifact present; anonymous protected requests denied; no browser asset contains private secret bytes/names exposed as values. Inspect generated client assets without printing secret matches. Run login/export size/timeout checks on the real host. STOP on secret leakage, unsupported packaging, unintended preview credentials or build/runtime failure. Stop builds and withhold beta; first release has no known-good Netlify deployment to roll back to. Stopping builds does not unpublish a live site: if leaked/unsafe serving exists, restrict or take that site offline and handle exposed credentials under a separately approved incident plan. Do not delete data or rotate the marketplace key automatically.

### M — Supabase Auth and hostname

Action: after the real HTTPS origin is known, Supabase Authentication → URL Configuration: Site URL = that origin; allow exact `https://HOST/auth/callback`. Record prior values first. Retain only deliberately needed local redirects; do not add broad production preview wildcards. Set Netlify NEXT_PUBLIC_APP_URL to the same origin and rebuild when a build-time public value changes.

Expected/validate: `/api/auth/login` establishes SSR cookies; `/auth/callback` exchanges a PKCE code; middleware refresh survives navigation; GET/POST `/auth/logout` clears the session. Inspect HTTPS cookie scope/SameSite/Secure behavior without logging tokens. Check invalid/expired callbacks and refresh after logout. No localhost fallback or cross-origin redirect. STOP on callback/session errors. Hold invitations, restore recorded URL settings if appropriate and retain the site off beta. Current callback is code-only: a dashboard email invite producing fragments or token_hash is NOT assumed compatible. Verify the email template/flow before any external invitation; add and locally test a supported confirmation/password setup flow if necessary before T.

### N — bounded manual worker acceptance

Action: with schedule still false and web/local timers off, dispatch on approved main: `gh workflow run sync-worker.yml --ref main -f tasks=commercial,inventory -f accounts=1 -f force=false -f finance_wakes=1`. Observe completion before dispatching the same for account 2. Each job has 25-minute worker budget and 35-minute hard timeout; concurrency serializes jobs. No all-account default dispatch. Inspect sanitized summaries and persisted state, not logs containing tokens.

Expected/validate: preflight passes, only selected account writes, durable cursors and lease release, no duplicates, failure status classified. Retryable/rate-limit outcome is not acceptance success. STOP on lease, key, schema, tenant, identity or V4 result mismatch. Leave scheduling off, retain durable cursors; do not clear state or force repeated WB calls. Release windows need not finish all historical catch-up.

### O — Account 1 reconciliation

Action: compare DB dashboard/report totals, orders/sales/finance freshness and report coverage to the frozen prior ranges. If additional finance catch-up is required and quota is available, explicitly dispatch tasks=finance-catchup, accounts=1, force=false, finance_wakes=1 once, then inspect persisted progress before any repeat.

Expected/validate: V1 routing allowlist 1, source-key uniqueness, no historical total regression, resumable bounded progress. STOP on unexplained deltas, data freshness misrepresented as complete or WB quota failures. Hold repeats and report remaining dates; never rewrite historical facts or change V4 to fit totals.

### P — Account 2 reconciliation

Action: compare the ten completed recovery periods (June 22–August 28) with current durable state; verify no historical recovery owner. Catch up later periods only through normal incremental V1, using the same single-wake bounded dispatch with accounts=2 when required.

Expected/validate: historical campaign remains completed/retired, normal cursor advances only on persisted pages, no reopened recovery windows or duplicate facts. STOP on reservation conflict, unexpected completed-period changes or lease mismatch. Hold worker, preserve state; do not set recovery true or reset cursor to hide a failure.

### Q — Ads freshness

Action: inspect per-account ads timestamps/coverage and reporting disclosure. If stale, dispatch tasks=ads for one explicit account at a time with force=false under the window; inspect result before next.

Expected/validate: account/source arbiter works, intended coverage improves, costs reconcile. STOP on quota/auth/duplicate or mismatched attribution. Keep ads stale disclosure and automation off. Ads are not in the hourly commercial,inventory schedule; a recurring ads cadence is a separate operational decision, not invented by this release.

### R — canonical population, without read cutover

Action: only after H/N, obtain a successful complete stocks pull through the approved account-scoped commercial worker. Compare canonical product/warehouse/size/chrt/barcode identities and quantities to that full source result, account by account. Repeat an accepted same-snapshot fixture locally to verify idempotency; do not manufacture production records for tests.

Expected/validate: both sizes/warehouses survive, supplied variant/barcode preserved, no duplicate canonical identity, no cross-account replacement, legacy/history unchanged. Reconcile any differences attributable to known legacy collapse explicitly. STOP on partial pull or unexplained mismatch; atomic replacement must not commit incomplete state. Leave legacy reads enabled even after population. Canonical read cutover requires a later explicit decision, never a hidden part of this package.

### S — scheduler ownership

Action: after N–R acceptance and approved freshness/staleness disposition, set SYNC_WORKER_SCHEDULE_ENABLED=true. Verify only GitHub hourly minute 20 runs commercial,inventory; no Netlify timer, local timer, manual recovery or external cron competes. Observe one scheduled tick and its account scope.

Expected/validate: one serialized owner, bounded budget, no overlap, correct finance reservation and no background web writes. STOP on duplicate owner, unexpected tasks or failed tick. Set schedule false to prevent new scheduled jobs; let a healthy in-flight transaction finish, then inspect leases before recovery. This control does not block explicit workflow_dispatch or manual routes, which remain operator-controlled.

### T — beta readiness, no automatic invitation

Action: use [beta checklist](beta-user-acceptance-checklist.md). Owner supplies one recipient and explicit company/account assignment before external user creation/invitation. Read the account-company relationship; do not infer permission from the finance allowlist. Set service-controlled app_metadata.orion with nonempty company_ids and marketplace_account_ids plus role viewer; never administrator or user_metadata. No external invite is authorized by this preparation package.

Expected/validate: fresh JWT contains exact claims, own-account views work, foreign-company AND same-company foreign-account requests fail, all-account/privileged sync fails. Validate CSV/XLSX/PDF, historical DB-only inventory, pricing simulation and feedback process. STOP on unknown assignment, unsupported invite callback, missing password-onboarding path or access leakage. Hold invitation, revoke access using the reviewed membership/session procedure if needed; account deletion is not a token-revocation strategy.

## Checkpoints and final release disposition

Record R0 before changes (backup/catalog/settings); R1 after seven proven metadata entries; R2 after each of E/F/G/H and I; R3 after configuration and main SHA; R4 after Netlify/Auth acceptance; R5 after manual account/ads/stock checks; R6 after sole scheduler acceptance. A checkpoint permits safe hold, not automatic destructive rollback. Production restore/delete is Human Gate 4; accounting changes are Human Gate 3. On any unresolved blocker do not invite beta users or claim publish readiness.

References: [Netlify Next.js runtime](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [stop builds](https://docs.netlify.com/build/configure-builds/stop-or-activate-builds/), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets). Existing private September 17 runbooks are historical evidence only; their Vercel handover requirements are superseded here.
