# Internal release candidate — engineering evidence

Application candidate: `1bb53c0f5c9905b243391dadb3eccdfa8301d94d`, derived from `7e1a11e2b80cddc7eb0f6516873f5c1af2454635`. Host-independent engineering acceptance completed September 20, 2026. This generic public-repository record is not deployment authorization. Production-derived counts, account state and the detailed operator action card remain in the ignored local `.audit/internal-release-candidate-2026-09-20.md` and companion runbooks.

## Changes and validation

- Hardened authentication redirects and malformed login handling; preserve refreshed cookies through redirects. Added one-time email confirmation and authenticated password setup with origin checking.
- Removed automatic dashboard ingestion; stock/report reads remain persisted reads. Inventory product enumeration now paginates. Pricing/inventory metadata reads do not decrypt marketplace credentials.
- Added scoped account-metadata SQL and a statement-scoped Finance RLS evaluation optimization. These change access metadata, not financial facts or accounting formulas. Migration application belongs to a separately approved change window.
- Fixed P&L/Settlement server-to-client renderer serialization, report category locale hydration, sidebar hydration timing and mobile controls.
- Added a read-only freshness notice, local synthetic Auth/tenant probes, generic release SQL and an offline regression runner. Private rehearsal artifacts are Git-ignored.

Final isolated Node 22.23.2 strict production build and `tsc --noEmit`: **PASS**. No build-error bypass; existing nonfatal lint/dependency warnings remain. Final browser secret-value scan: **157 assets, zero matches** for private local test values. No Financial Engine V4 arithmetic source change.

Offline runner `scripts/verify-internal-release-candidate.mjs`: **31 PASS, 7 EXPECTED SKIP, 0 FAIL, 0 ENVIRONMENT BLOCKED**. Run from an isolated Node 22 checkout without production `.env` files. Request-context/live subchecks are deliberately separate from offline fixtures.

**PASS:** production-data-plane; marketplace-fee-signed; sales-event-identity; sales-price-readiness-offline; product-cost-product-scope; reporting-export-9-5; weekly-business-excel; csv-formula-safety; finance-incremental-offline; finance-incremental-lease-offline; finance-recovery-bounds; finance-page-recovery; finance-recovery-campaign; finance-zero-corrections-offline; deployed-finance-reservation; account1-reports-v1-migration; commercial-continuity-authz-offline; product-pagination-offline; auth-redirect-offline; dashboard-read-boundary-offline; financial-pagination-offline; inventory-retention-safety; inventory-history-table; canonical-current-stock-offline; wb-current-prices-offline; sync-worker; worker-production-readiness; secrets-7-1-e; warehouse-db-only-10-6; advertising-ingestion; loss-bearing-products-offline.

**EXPECTED SKIP:** offline live-request portions of product-profit-report-9-3, settlement-report-9-2, group-performance-report-9-4, reporting-module-9-1, smart-pricing-v2-8-1, tenant-authorization-p0 and inventory-intelligence-6-46-1. Their available fixture/static assertions passed. Separate loopback-only acceptance: **41/41 HTTP checks**, Product Analytics **2/2**, Inventory Intelligence **2/2**, V4 account/period checks **4/4**, synthetic onboarding and SQL tenant/lease/stock/price assertions **PASS**. This does not claim the skipped CLI calls executed.

Representative browser acceptance covers loading/empty/stale states, reports, account controls, viewer navigation, logout and a 390×844 mobile viewport. No new hydration errors after corrections. Hosted Functions/Edge packaging, HTTPS cookies, real email delivery and real marketplace worker acceptance remain **ENVIRONMENT BLOCKED** until the separately approved publish phase. They are not unresolved local engineering failures.

## Release discipline

Use the [execution package](human-gate-2-execution-package.md), [environment contract](netlify-environment-contract.md), [beta checklist](beta-user-acceptance-checklist.md) and [operations guide](beta-operations-troubleshooting.md). Verify actual production state privately before execution. Public documentation is not a live production inventory.

Keep scheduling opt-in, stock reads on the approved initial source, credentials server-only and all production mutations behind the release gate. Quiesce writers and verify a fresh recovery point before schema work. Validate migrations individually, preserve durable cursors, and hold on unexplained deltas. Do not restore broad policies, reset financial state, rotate encryption keys or perform destructive restores automatically. No beta invitation before controlled host/security/data acceptance.
