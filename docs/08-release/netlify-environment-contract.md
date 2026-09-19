# Netlify and GitHub release contract

Netlify is the selected first web host; GitHub is the only planned sync scheduler. No deployment or configuration change is authorized by this document.

## Build and runtime

`netlify.toml` selects `npm run build`, `.next` publish handling and Node 22 (matching the worker). Netlify automatically installs its OpenNext adapter; do not add a legacy adapter, static export, catch-all SPA redirect or custom start command. Record the resolved adapter version at deployment. The locked application uses Next.js 15.5.19 App Router.

Netlify documents SSR, Server Components, Server Actions and route handlers in its serverless function, and middleware in an Edge Function. Our middleware uses the Supabase SSR client and Web APIs. A successful local Next build does not prove Netlify packaging or its function limits: verify the generated functions and real XLSX/PDF sizes/timeouts in the first controlled deployment. Do not run long sync routes as web-host background jobs; use the bounded worker.

Reference: https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/

Local validation: strict Next production build passed on Node 22.23.2 in an isolated worktree/output directory; TypeScript passed. Synthetic private markers were injected only for the build and were absent from all 154 scanned browser JS/JSON assets. Static secret checks and hosted-runtime/campaign regressions passed. No live credentials or Supabase URL were provided to that build. Netlify adapter packaging and live hostname acceptance remain deployment gates, not claimed local test results.

## Environment matrix

All names below are configuration contracts, not credentials. Keep runtime values in provider settings. Netlify TOML build environment is not a substitute for Functions/Edge runtime configuration. Production secrets must not be inherited by untrusted deploy previews.

| Variable | Netlify | GitHub worker | Exposure and relationship |
| --- | --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Required; Builds and Functions | Uses SUPABASE_URL secret | Browser-safe; same project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Required; Builds and Functions | Uses SUPABASE_ANON_KEY secret | Browser-safe anon key; same project; never service role |
| SUPABASE_SERVICE_ROLE_KEY | Required; Functions | Required repository secret | Server-only; same existing credential |
| MARKETPLACE_CREDENTIALS_KEY | Required; Functions | Required repository secret | Server-only; same existing encryption key, never generate a replacement for stored ciphertext |
| INTERNAL_API_SECRET | Required; Functions/Edge middleware | Not required | Web-only secret for containment/authenticated internal calls |
| NEXT_PUBLIC_APP_URL | Required for production self-URLs once assigned | Not required | Browser-safe canonical HTTPS origin; web-only |
| ORION_RLS_DATA_PLANE | Required beta value 1, after RLS validation | Not required | Server-only web flag; JWT tenant data plane |
| ORION_CURRENT_STOCK_SOURCE | Required initial value legacy | Not required | Server-only web read switch |
| INVENTORY_SNAPSHOT_SCHEDULER | Required value 0 in runtime | Workflow fixes 0 | Server-only; prevent process timers |
| FINANCE_V1_LIVE_REQUESTS_ENABLED | Required intended true | Required repository variable true | Server-only; same routing policy; activate only in approved window |
| FINANCE_V1_ACCOUNT_IDS | Required intended 1 | Required repository variable 1 | Server-only; same numeric marketplace account ID |
| ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE | Required intended false | Required repository variable false | Server-only; same quota ownership policy; fresh pre-activation check |
| CRON_SECRET | Not required; omit | Not required | Dormant Vercel cron; no live cron owner |
| NODE_VERSION | Build 22 in TOML | setup-node 22 | Build/runtime selection, not secret |
| NEXT_PUBLIC_APP_LOCALE | Optional | Not required | Browser-safe locale |
| NEXT_PUBLIC_PERF_AUDIT | Optional; leave off | Not required | Browser-safe diagnostic flag |
| FINANCE_LOOKBACK_DAYS / FINANCE_GAP_WARN_DAYS | Optional | Optional if deliberately wired | Server-only tuning; retain defaults |
| WB_API_TOKEN | Omit | Omit | Legacy seed only; tokens live encrypted per account |
| SUPABASE_DB_PASSWORD / SUPABASE_ACCESS_TOKEN | Omit | Omit | Migration/operator tooling only |

Never use NEXT_PUBLIC_ aliases for the service-role, encryption or internal secret. Do not expose them through next.config env, client props, or serialized responses. Auth middleware needs the public Supabase pair and the internal secret in its deployed server/edge environment; confirm these are available in the packaged deployment without logging values.

## Authentication and hostname

Password login uses `/api/auth/login` and server-set Supabase cookies. `/auth/callback` exchanges a PKCE `code` through `exchangeCodeForSession`, then redirects within the request origin. Middleware refreshes sessions; logout clears the session. No hostname should be invented before site selection.

Once the real hostname exists, set NEXT_PUBLIC_APP_URL to its HTTPS origin and configure Supabase Auth Site URL and the exact `https://<hostname>/auth/callback` redirect allowlist. Confirm invite/magic-link templates use the chosen flow; do not assume every email template produces a PKCE code. Keep broad preview wildcards and production credentials out of previews. Verify cookie propagation, login/logout, callback errors, tenant selection and cross-tenant denial on that hostname.

Reference: https://supabase.com/docs/guides/auth/redirect-urls

## Finance decision evidence

The production SELECT audit on 2026-09-19 establishes marketplace_accounts.id is bigint and Account 1 is 1, not a UUID. The allowlist parser explicitly accepts positive numeric identifiers. Account 1 has an existing completed anchor through August 30.

Account 2's local campaign artifact reports completed for June 22–August 28, no active chunk and recoveryActive=false. Production incremental metadata contains the matching ten completed ranges, has no lease, and is already in normal current_week mode for August 29–September 4 at cursor 0. Its latest_successful_data_date is August 30. This proves unfinished incremental catch-up, not current freshness or unpublished WB availability.

The intended reservation value is false: the completed historical campaign can retire and the existing V1-only incremental route owns later backlog. True would suppress ordinary Account 2 finance ingestion. Before activation, recheck no new recovery campaign/operator has taken ownership; any changed evidence stops activation. No historical state, cursor, or business data is rewritten by this decision.

## Single setup procedure (execute only in the approved configuration window)

1. GitHub repository Settings → Secrets and variables → Actions → Secrets: add SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and MARKETPLACE_CREDENTIALS_KEY from the trusted existing project configuration. Never paste credentials into chat or use an encryption key different from the one protecting account tokens.
2. On the Variables tab, add FINANCE_V1_LIVE_REQUESTS_ENABLED=true, FINANCE_V1_ACCOUNT_IDS=1 and ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE=false after the fresh ownership check.
3. In Netlify, configure the production-only matrix and select Node 22 / npm run build / .next. Keep automatic publish and previews disconnected from production until the approved release. Do not trigger an initial deploy merely to create a hostname.
4. Before merging the scheduled workflow, hold scheduling. Validate one bounded manual run under approval before enabling hourly scheduling. GitHub schedule activation after merge is itself a production action.
5. After hostname assignment, complete Auth URLs, callback/cookie checks and beta access verification. Keep canonical stock reads disabled until their separate reconciliation gate passes.
