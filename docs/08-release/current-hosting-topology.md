# Current hosting topology and first beta deployment

Evidence reviewed on 2026-09-19. This record supersedes earlier documents that assumed a live Vercel scheduler.

## Observed topology

The owner confirms having no Vercel account. Vercel production is **NOT EVIDENCED / NOT IN USE**. Neither repository/history searches nor GitHub deployment metadata provide evidence of a past Vercel deployment. This does not prove a universal negative about every past manual deployment.

The evidenced application model is local Next.js development/manual scripts connected to hosted Supabase. No external web deployment URL, provider project identifier, Netlify site link, Railway/Render configuration, VPS service, PM2 configuration, or production app Docker deployment was found. README documents localhost. Scripts named `deploy` perform database/sync operations, not web hosting. Docker currently contains the local Supabase rehearsal/recovery stack.

Netlify is named in the worker architecture as an intended host; this is design evidence only. Keep `vercel.json` unchanged and dormant.

## Writer map

- Local dev app: possible writer through manual sync and the inventory continuity timer. `instrumentation.ts` starts that timer in Node; development defaults on unless `INVENTORY_SNAPSHOT_SCHEDULER=0`. No matching OrionShop process was found at inspection time.
- Local CLI: manual sync, finance catch-up and recovery commands can write hosted Supabase when configured. No matching running process was found.
- Authenticated sync routes: possible writers when the local app is running; do not invoke them as health probes.
- Windows Task Scheduler: no task action matching OrionShop, its worker, commercial continuity, or PM2 was found. This scoped scan cannot exclude an unrelated wrapper name.
- GitHub: Actions is enabled, but API reports zero workflows and runs. The worker exists only on the feature branch and is not active. It becomes a possible automatic writer after merge to the default branch.
- External cron/Vercel/other host: not evidenced. No external scheduler is assumed.
- Supabase: hosted database/auth backend, not evidence of an external Next.js web host. Existing writer-state queries are snapshots, not a guarantee against later local activity.

## GitHub configuration

Authenticated name-only APIs return zero repository secrets, variables and environments. The owner is a personal GitHub User; organization secret inheritance is not applicable. Required secrets are SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and MARKETPLACE_CREDENTIALS_KEY. Required variables are FINANCE_V1_LIVE_REQUESTS_ENABLED, FINANCE_V1_ACCOUNT_IDS and ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE. All are missing. Never put values in this document.

## Recommended beta architecture

Propose Netlify for the first Next.js web deployment, existing hosted Supabase for database/auth, and GitHub Actions for bounded ingestion. This follows the intended worker architecture without adding a VPS. Netlify documents App Router support through its Next.js adapter: https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/

Hosting choice/account access still needs owner confirmation. Before public use, verify adapter behavior for auth cookies, middleware, server rendering and CSV/XLSX/PDF routes under realistic sizes. Configure Supabase auth URLs for the selected hostname. Disable web inventory timers and retain legacy stock reads. No CRON_SECRET or Vercel control-plane step is required for this topology. INTERNAL_API_SECRET and required server-side application credentials remain necessary.

## Human Gate 1

Confirm Netlify (or another chosen Next.js host) and provide account/project access without deploying. Arrange the four GitHub secrets and three finance variables through a secure channel during the approved configuration window; align the proposed web configuration. Do not paste secret values into chat. No Vercel UI action is required. GitHub organization/environment inheritance checks are removed.

Then finish host-specific acceptance preparation and request the production change window. Before workflow merge, prevent automatic scheduled execution until the bounded manual tick is approved and passes. Hold local development/manual writers during schema gates. No migrations, host creation, configuration changes, workflow activation or deployment are authorized by this document.
