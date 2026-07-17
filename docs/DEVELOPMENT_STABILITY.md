# Development Stability Guide (Sprint 6.12)

This project supports **one** development workflow:

- Start exactly one dev server with `npm run dev`
- For phones / other PCs on the same LAN, see [DEV_LAN.md](./DEV_LAN.md)
- Keep that server running for your session
- Reuse the same terminal instead of starting additional servers

## Why this policy exists

Running multiple `next dev` processes against the same workspace can race on `.next` artifacts and lead to:

- CSS not loading
- HTML-only rendering
- missing `webpack` / `vendor-chunks`
- sporadic internal server errors after long sessions

The `dev` launcher now blocks accidental multi-server startup.

## Standard mode recommendation

- **Project standard:** Next.js Webpack dev mode (`next dev`)
- Do not mix dev engines in the same workspace session.

Rationale:

- Current project history and tooling are Webpack-based.
- The observed chunk path failures were in Webpack output and were amplified by multi-instance cache contention.
- A single, consistent mode minimizes cache invalidation edge cases.

## Mac / Windows workflow

Use the same workflow on both platforms:

1. Install dependencies once: `npm install`
2. Start dev server once: `npm run dev`
3. Keep that terminal open
4. If another terminal needs logs, open the same running terminal output (do not launch another server)

## Fallback recovery (only if needed)

If startup fails after an interrupted session or stale lock:

1. Stop all running `next dev` processes
2. Run `npm run dev:recovery`
3. Start again with `npm run dev`

This is a fallback only, not a normal workflow.

## Known limitations

- On extremely large date ranges and very high row counts, rebuild/hot-update latency can still increase.
- `EMFILE` can still occur on constrained environments, but reduced watcher churn and single-server policy should significantly lower incidence.
