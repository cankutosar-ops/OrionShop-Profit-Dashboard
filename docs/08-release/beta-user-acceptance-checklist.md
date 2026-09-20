# Beta-user acceptance checklist

Use this checklist only after the production deployment, tenant configuration, and scheduler ownership are verified. The beta user must be a non-admin user with membership only in the intended company and marketplace account.

Before invitation, obtain the owner's recipient and explicit company/account assignment and verify the account belongs to that company. Neither is inferred from the finance rollout. Use a service-controlled Auth admin update that preserves unrelated app metadata and sets `app_metadata.orion.company_ids=["APPROVED_COMPANY"]`, `marketplace_account_ids=["APPROVED_ACCOUNT"]`, `role="viewer"`. Both arrays must be nonempty. Omitted/empty account claims mean all accounts in the company in the existing resolver. Do not use the generic grant-tenant-access script without reviewing its company-wide behavior. Do not use user_metadata for authorization.

Refresh the session after assigning claims. Validate own-account access and denial of both a different company and another account within the same company. The viewer label alone does not enforce scope; verify actual API authorization.

No invitation is sent during preparation. Before sending one, verify the production email template and onboarding flow using a controlled internal account: the current `/auth/callback` only exchanges PKCE codes, and does not itself consume token_hash or fragment-based invite links or provide password setup. Hold external invitations until an end-to-end supported flow is proved; if missing, implement/test that flow separately before invitation. Deliver credentials or invite links only through the authorized authentication/email channel, never in Git, logs or chat. Record consent and scope without recording tokens.

1. Sign in and sign out; confirm the session is cleared after logout.
2. Confirm only the assigned company and marketplace account appear in selectors.
3. Open the dashboard and change the date range; check loading, empty, error, and stale-Sales states.
4. Check Marketplace Fee values, including anomaly presentation where applicable.
5. Open Product Profit and Product Analytics; confirm totals, filters, and zero/missing Product Cost disclosure are understandable.
6. Open Category, Brand, and Settlement reports; confirm Category Settlement is labelled legacy.
7. Download CSV, XLSX, and PDF exports; confirm files open and show the selected company, account, and period.
8. Open inventory and warehouse views; confirm historical views do not show unexpected live-sync behavior.
9. Open Smart Pricing; confirm it is presented as a simulation and does not change Product Cost.
10. Attempt direct navigation to administration and a foreign company/account URL; confirm access is denied.
11. Confirm no normal-user route can start an all-account sync or a foreign-account commercial sync.
12. Record any confusing labels, broken responsive layout, error state, or data discrepancy with the URL, selected account, date range, and screenshot.
