# Finance publication-aware completion

The approved rule requires a terminal Reports V1 HTTP 204 **and independent publication coverage** for the entire requested interval. Empty responses, operation/rr dates, Sales/Orders activity and calendar age are not publication proof.

## Evidence and producer

Use the existing `warehouse_sales_report_snapshot` rows produced by `kpi-snapshot-sync` from the WB Finance `/api/finance/v1/sales-reports/list` endpoint. The [official WB response contract](https://dev.wildberries.cn/docs/openapi/documents-and-accounting) supplies report ID, dateFrom, dateTo and createDate. Only same-account Wildberries rows tagged `meta.source=wb_sales_reports_list`, with valid positive report IDs, valid publication dates and observation timestamps no later than the terminal wake's start, qualify. Report intervals must cover the requested interval continuously, including its end. Gaps and partial coverage remain pending. A report containing the entire requested range is sufficient; a later report separated by a gap is not.

The page wake reads this durable metadata only. It adds no marketplace requests, quota changes or report-list refresh to the one-page wake. Missing/stale metadata may conservatively hold a genuinely published period; refresh through the existing reviewed metadata producer under separate bounded authorization. Do not synthesize evidence from completed anchors or latest Finance operation dates.

## State and fencing

`awaiting_publication` is an explicit wake outcome. Durable storage retains `week_status=in_progress`, the active interval and persisted cursor, with `last_error=awaiting_publication` (or `awaiting_publication:evidence_unavailable` on a metadata read failure). It records the observed 204 without marking the period complete. This uses existing columns and their fenced commit RPC: **no migration is needed**.

A later wake resumes the same cursor and must observe terminal 204 again with qualifying evidence. Successful completion stores supporting report IDs, covered interval, account, source and observation cutoff inside that period's existing `completed_weeks` JSON entry. Existing completed historical entries remain untouched. Catch-up stops on pending; commercial Finance reports partial instead of success. Data-page persistence, corrected-zero handling, 70-second pacing, 429/error behavior and lease ownership checks are unchanged.

## Verification and production hold

The offline publication verifier covers empty cursor-zero and nonzero sequences, later evidence, incomplete/gapped/wrong-account/untrusted/future evidence, 401/403/429/500, malformed data, persistence failure, lease loss, retained historical anchors, and a catch-up worker that stops after one pending wake. Existing incremental/recovery/routing/zero-correction verifiers remain applicable; their successful-terminal fixtures explicitly supply independent publication evidence.

Local restored-DB rehearsal uses synthetic account 990003, real lease/state RPCs and real report-snapshot reads. The old approved implementation marks an uncorroborated 204 complete. The candidate retains pending state across a fresh client, preserves cursor zero and nonzero, and completes after valid metadata is supplied. Fixtures are local-only and cleaned up. No production writes or WB calls occur during this fix preparation.

Read-only review on September 20 found no stored report-list metadata covering the latest production periods (A1 through September 13, A2 through September 11). Their previous terminal responses followed real data pages; they are **unverified under the new evidence rule**, not proven false. Preserve all historical completed anchors. Do not reclassify or backfill evidence automatically.

## Next approval and web preparation

The new SHA requires approval before main/production use. First recheck the stored metadata and writer state; after approval, one Account 1 Finance wake (finance_wakes=1) may verify either published completion or the pending hold. A missing-evidence hold is expected, not proof that WB has not published the interval. No automatic refresh, retries, Account 2 dispatch, schedule activation or historical repair is implied.

Existing Netlify/Auth/beta runbooks remain the web preparation contract. No new browser-facing environment variable or secret is introduced. Publish-time acceptance must display pending Finance as incomplete, preserve tenant/account selection and test reports/exports and login/logout. Hosting, Auth URLs, recurring scheduling, canonical stock read cutover and real beta invitations remain deferred. Financial Engine V4 formulas and Product Cost rules are unchanged.

Candidate verification passed: publication, incremental, atomic lease, zero corrections, V1 migration, Account 1 compatibility, Account 2 recovery, recovery bounds/page/campaign, sync worker and worker production readiness; strict Node 22 production build and TypeScript; four read-only V4 checks (both accounts, June 22–28 and August 24–30). Offline auth redirect/authorization and reporting/export checks passed. Live web/report reconciliation was not run by the offline suite. Static secrets checks passed with local-only configuration; the production-build browser scan found zero private test values across 157 assets. The first environment-free secrets invocation reported missing local configuration; supplying the existing local-only configuration resolved it.

The final read-only comparison matched all public business-table fingerprints to the preceding catch-up hold. Both accounts remain idle, with no active period or lease. Scheduling is false and no queued/running GitHub jobs were present. This candidate changes neither the production SHA nor production data/configuration.
