# Beta-user acceptance checklist

Use this checklist only after the production deployment, tenant configuration, and scheduler ownership are verified. The beta user must be a non-admin user with membership only in the intended company and marketplace account.

Before invitation, obtain the owner's recipient and explicit company/account assignment and verify the account belongs to that company. Neither is inferred from the finance rollout. Use a service-controlled Auth admin update that preserves unrelated app metadata and sets `app_metadata.orion.company_ids=["APPROVED_COMPANY"]`, `marketplace_account_ids=["APPROVED_ACCOUNT"]`, `role="viewer"`. Both arrays must be nonempty. Omitted/empty account claims mean all accounts in the company in the existing resolver. Do not use the generic grant-tenant-access script without reviewing its company-wide behavior. Do not use user_metadata for authorization.

Refresh the session after assigning claims. Validate own-account access and denial of both a different company and another account within the same company. The viewer label alone does not enforce scope; verify actual API authorization.

No invitation is sent during preparation. Local synthetic acceptance now proves one-time invite confirmation, password setup, viewer isolation, membership removal and logout. `/auth/callback` remains the PKCE flow; email invitations use `/auth/confirm` followed by the protected `/auth/password` page. After a real HTTPS Site URL exists, set the invite template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` and the reset template to the same path with `type=recovery`. Record prior templates/settings. Prove real-host cookie propagation and controlled internal email delivery before inviting an external user; local link generation does not prove email delivery. Deliver links only through the authorized Auth email channel, never Git, logs or chat.

Production procedure, only after owner approval: verify the recipient and account-company relationship; create the confirmed internal test user or invite the approved recipient through Supabase Auth administration; assign the explicit app metadata above before accepting the session; verify a refreshed session and all denial cases below. Do not create extra tenants/accounts or give an administrative role. For a reset, send the approved Auth recovery email using the tested confirmation template, then validate the new session and logout.

To remove access, preserve unrelated app metadata but clear BOTH Orion company and account arrays (clearing only accounts widens access within the remaining companies). Revoke refresh sessions through Auth administration and verify application APIs deny the existing session. The application checks fresh `getUser` metadata, but direct Data API RLS uses JWT claims until token expiry; session revocation or user deletion alone does not invalidate already issued JWTs. For urgent immediate Data API revocation, hold access and use a separately reviewed containment procedure instead of claiming instant token invalidation. Record configured JWT expiry and wait out that lifetime before declaring all direct access revoked. No deletion is needed for routine removal.

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
