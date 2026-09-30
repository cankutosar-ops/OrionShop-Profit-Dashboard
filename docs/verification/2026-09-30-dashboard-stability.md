# Dashboard loading verification — 2026-09-30

Status: local fixes verified; no commit, push or application deployment in this pass.

## Findings and changes

- Explicit full prefetch on both sidebars could render data-heavy routes that the user had not opened. Disabled it.
- Scope navigation had a 2.5-second hard-navigation fallback and a refresh after navigation. The account-switch overlay triggered another refresh. Removed these duplicate/interrupted render paths; one App Router navigation now owns each selection.
- The connection error boundary retried every 30 seconds. A sufficiently slow repeated failure could restart this cycle. Removed automatic retries; the connection retry button requests a fresh page.
- The income-only dashboard tax estimate performed another company-wide finance/ads/expense audit after its primary data load. It now reads only the effective tax profile. Income-minus-expenses retains the company-wide deduction calculation.
- Paginated reads now use up to four concurrent pages per query. They preserve page order, respect a lower API row cap, retain all filters, and reject incomplete counted pages instead of returning partial totals.
- Narrowed dashboard projections; retained signed `raw_amount` for WB remuneration. Full and projected dashboard payloads match in the 40,062-row transport fixture.
- Added a 40-second dashboard read budget encompassing scope resolution and data loading. Expiry aborts participating Supabase HTTP requests and renders a reload message. Auth reads also use the existing 20-second per-request limit. This is a failure bound, not a promised response time.
- Live dashboard query failures propagate to the error boundary instead of substituting sample financial figures. Sample mode remains available when Supabase is unconfigured.
- Immediately handle the concurrently started fact-query rejection if product loading fails first.

## Live database evidence

Read through the Supabase connector. The default last-24-hour log query returned PostgREST timeout events, including `Warp server error: Thread killed by timeout manager` and two statement-timeout messages. These establish server-side timeout activity, but are not correlated to a specific browser request and do not by themselves prove its root cause.

All 11 indexes from the pending fact/relation index migrations exist in production. Local migration versions now match the recorded applied versions: `20260930075144` and `20260930075352`. They were already applied before this pass; no additional schema mutation here.

An admin SQL EXPLAIN ANALYZE for account 2, September 1–30, using the narrow finance projection and offset 39,000, used `idx_wb_finance_account_operation_date_id`. It scanned 37,974 matching rows, returned zero rows at that offset, and took approximately 1,070 ms. This is one SQL observation, not an authenticated dashboard timing or evidence of an end-to-end speedup. A subsequent activity snapshot had four client-idle connections and one active connection; it does not establish sustained capacity.

## Verification

- `npm run build`: passed, including type validation; pre-existing lint warnings remain.
- `npm run verify:dashboard-loading-behavior`: passed. Real Supabase query builders with a local transport fixture: 0–40,062 rows, lower row caps, missing counts, errors, scope filters, deterministic result order, concurrency bound, HTTP cancellation, request-signal preservation, independent budgets, tax regimes, signed fee projection, full/projected dashboard equivalence, and live-error rejection.
- `npm run verify:dashboard-connection-recovery`: passed (deadline behavior plus source guardrails).
- `npm run verify:dashboard-tax` and `npm run verify:marketplace-fees`: passed.
- Navigation, account-switch and 6.37.1 regression scripts: passed.
- Tenant authorization script via `node --import tsx`: offline checks passed; live tampering check skipped without a local server. The `npx tsx` launcher initially failed on a restricted IPC socket; the direct Node loader succeeded.
- Product-cost isolation: passed.
- Ads-account isolation: static checks passed; its live stage could not run because local Supabase credentials are absent. Do not report the whole script as passed.
- `git diff --check`: passed.

## Remaining release acceptance

Authenticated browser E2E did not run: neither E2E login configuration nor a local Chromium binary is available. No production credentials were copied or generated for testing. The changes therefore must not be described as a proven permanent production fix yet.

After the single intended deployment, verify a cold dashboard opening, account changes, date changes, and browser reload with real authorized sessions on both stores. Record complete load times and browser/server errors. Check that no unused sidebar pages load in the background, scope selection does not restart the same request, and a failed load displays no financial totals. Match any recurrence to its hosting request logs.

Offset pagination still has no cross-page database snapshot guarantee during concurrent ingestion. This change detects short/incomplete counted pages, but does not claim transactionally consistent snapshots. Very large historical ranges and the full income-minus-expenses evidence path remain candidates for measured aggregation work; this pass does not claim unlimited data-volume scaling.

## Repeated audit requested by Cankut — final pending source state

The earlier checks did not cover the complete Next runtime, including its Edge middleware. This pass added a compiled-application HTTP test instead of relying solely on source-text checks and direct service calls.

Additional corrections:

- Middleware session verification, which ran before the page's read budget, was unbounded. It now has an 8-second operation deadline and cancels the participating transport. Server page/API session checks also have an 8-second budget, including client initialization and refresh work.
- Temporary Auth/network failures previously looked like a missing session and could redirect to login. They now return a reload page or `AUTH_UNAVAILABLE`/503 for APIs. Missing/invalid sessions remain unauthorized. The reload page is rendered dynamically, avoiding a blank initial response from static client-rendering bailout. HTML/Flight error pages are normal 200 responses with no-store headers; their API equivalents use 503. No tenant data is released on an unavailable Auth check.
- The Edge runtime used by the compiled Next app does not expose `AbortSignal.any`. The new middleware transport initially failed there; the compiled-app test caught this before publication. The final transport handles both runtimes, preserves caller cancellation, and is tested with `AbortSignal.any` absent.
- Optional balance/report loads now have their own canceling 5-second budget. Shared dashboard SQL starts outside that short optional context. A hung optional load no longer cancels the core SQL and produces an explicit availability message after its deadline.
- Core data's 45-second deadline now cancels its transport, including direct service use outside the page. The page's encompassing 40-second budget remains in place. These budgets do not include all hosting cold-start overhead and are not an SLA.
- Server audit recording no longer writes files or records timings on ordinary production requests unless explicitly enabled. Synchronous failure cleanup and late-event fingerprint handling were corrected. Lightweight completion/failure timings remain logged.
- Each request gets an application-generated `x-orion-request-id`. Dashboard timing/error records and slow-query logs carry it; the compiled test confirms the response ID matches its server timing record. This permits correlation after deployment instead of inferring a root cause from unrelated log events.
- All error-boundary manual retries perform a fresh page load; they do not reuse a failed server-render payload.
- Empty-period classification now uses persisted orders/sales/finance/ads, rather than catalogue presence or a positive net-sales value. Tests confirm that catalogue-only periods are empty and finance-only, unattributed account totals are preserved.

Final verification on the pending code:

- `npm run build`: passed, with the existing unrelated lint warnings.
- `npm run verify:dashboard-loading-behavior`: passed, including the new empty-period and finance-only cases.
- `npm run verify:dashboard-connection-recovery`: passed.
- `npm run verify:server-loading-guards`: passed. Edge-compatible transport abort, Auth outages versus invalid sessions, production recording disabled by default, and explicit audit opt-in.
- `npm run verify:dashboard-production`: passed. Real compiled Next server with an isolated loopback Supabase/Auth fixture and no production credentials. Covers unauthenticated redirect, accounts 1/2/1, 40,062-row finance pagination, React cache sharing between Core and the optional strip, HTML and Flight completion, concurrent requests, changed date filters, forbidden account access, middleware Auth errors, hanging Auth cancellation, page-only Auth failure, API 503, finance failure without sample totals, optional cancellation with a healthy core, and a subsequent healthy request.
- Tax-profile, marketplace-fee, tenant isolation, navigation, account-switch and 6.37.1 regression checks passed. The separate tenant script's live-server case still skipped; compiled HTTP forbidden-account coverage ran against fixtures.
- `git diff --check`: passed.

The final compiled-app run measured these **local fixture timings, not Netlify/Supabase production speeds**:

| Scenario | Result |
| --- | --- |
| HTML, small fixture account | 171 ms first request; 59 ms repeat |
| HTML, 40,062-row fixture account | 725 ms, 41 finance page requests total |
| Flight, 40,062-row fixture account | 593 ms |
| Three concurrent HTML/Flight requests | slowest 990 ms |
| Auth that never responds | canceled; controlled response in 8,032 ms |
| Optional snapshots that never respond | canceled; healthy core and availability message in 5,051 ms |

The 41 page requests include one count-bearing first page; the finance history is loaded once for that dashboard render, not twice for Core/optional sections or again for income-only tax.

Fresh read-only production checks returned 35,880 and 37,974 finance rows for accounts 1 and 2 respectively in September 1–30. The last-24-hour log aggregate had 113 timeout-bearing PostgREST events, two timeout-bearing PostgreSQL events and zero timeout-bearing Auth events. This does not establish that Auth caused the user's production failure; its unbounded/failure path is a separately verified resilience defect. Existing production timeout events cannot yet be matched to the new request IDs because these pending changes have not been deployed.

Regression gates added:

- `.github/workflows/dashboard-quality.yml` runs fixture behavior, authorization checks, the production build and the compiled-app HTTP scenarios on PRs and main pushes. It will start running only after the workflow is pushed.
- `netlify.toml` runs the isolated data-loading, transport and deadline checks before the normal production build. A failure stops that build. The loopback compiled-app test is kept in CI rather than run against a Netlify build containing real inlined public environment values.

Full browser hydration/click testing remains unverified. A Chromium download was attempted into a temporary directory but returned an invalid/truncated archive; no browser was installed. The HTTP/Flight integration test did run. Production cookie/session handling and the user's actual Netlify cold opening still require post-deployment acceptance. No commit, push, deployment or additional live schema mutation was performed in this repeated audit.
