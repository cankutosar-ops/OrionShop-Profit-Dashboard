# Hosted Auth redirect acceptance hold — September 24, 2026

Main and Netlify's published, locked deployment remain `7889cec6ebb025165b2053e4bef83204474a397d` (deploy `6ab009ec941aa80c03985d20`). Workspace `orion`, site `orionshop-dashboard`, Free/$0. Automatic publishing was not unlocked. No beta invitation or worker dispatch occurred.

HTTPS login, persistence, middleware refresh and logout passed Secure, HttpOnly, SameSite=Lax and Path=/ assertions. Anonymous/invalid-session denial, administration denial, foreign company/account denial and omitted-account privileged-sync denial passed. Eighteen account-scoped dashboard/report/analytics/inventory pages returned successfully. Four server XLSX exports passed, and the browser generated CSV/PDF/Excel. Mobile dashboard rendering, stale/awaiting-publication/missing-cost states and the Category Settlement legacy disclosure were observed. The Next.js function and edge runtime worked on Free; inspected function logs showed successful invocations. These results do not certify complete beta acceptance.

## Blocking result

An existing internal identity's successful recovery confirmation returned HTTP 307 to `/auth/password` **with the original `type` and `token_hash` query parameters appended by the hosting path**. Only parameter names and a token-forwarding boolean were recorded. No email was sent, password changed, new user created, or token printed. Invalid confirmation redirects already have an explicit `error` query and did not inherit the incoming query.

The route constructs a clean destination, but Netlify forwards the incoming query when the redirect destination has none. This matches the adapter maintainers' [documented resolution of issue 2209](https://github.com/opennextjs/opennextjs-netlify/issues/2209): an explicit inert query prevents the fallback. The consumed hash should not be carried to the next page even though successful verification makes it one-time and the response sets `Referrer-Policy: no-referrer`.

The forward correction adds `_auth_redirect=1` only to otherwise queryless Auth redirect destinations. It is never read as an authentication or authorization signal. Confirmation and PKCE callback use the helper; intended callback filters and fragments remain intact. Callback responses also receive private/no-store and no-referrer, matching confirmation. Session creation, cookie security, memberships, passwords, accounting and worker behavior are unchanged.

The offline regression exercises actual route modules and NextResponse, with only the Auth provider mocked. It reproduces the observed platform fallback with a sanitized fixture, then checks nine invite/recovery/callback success, failure and redirect cases. The local Supabase onboarding verifier now rejects confirmation redirects carrying the hash and requires the explicit marker. Node 22 production build and TypeScript pass. A fresh full local Supabase onboarding run remains pending: Docker could not start because WSL returned `Wsl/Service/CreateInstance/CreateVm/HCS/0x800705aa` (insufficient system resources). Do not present the previous release's local onboarding pass as a new run for this correction.

## Data and safe hold

All 27 public business-table fingerprints matched before/after September 24 hosted acceptance. Finance leases were absent; GitHub schedule opt-in remained false and recent scheduled jobs were skipped. V4, costs, schema, canonical stock reads and production business data were not changed by this window.

Do not reuse September 20 freshness totals as current evidence: before this window, a manual Account 1 commercial attempt occurred September 21 and snapshots were added for September 21–22. Account 1 Sales/Orders now reach September 21; Account 2 September 20. Both Finance datasets remain September 13 with awaiting-publication state; Ads September 20; Inventory September 22. Missing costs remain 42/91 and 598/659. The known historical gaps are not filled by those new snapshots. The originating process for the intervening writes was not established from the sync records alone.

Netlify Production **and** Deploy Previews are now Private (team login required), with automatic publication still locked. Auth Site URL stays `https://orionshop-dashboard.netlify.app`; exact redirects are the hosted `/auth/callback`, `http://localhost:3000`, and its `/auth/callback`. Prior rollback baseline remains Site URL `http://localhost:3000` with no redirects. No Auth template or recipient changes were made.

## Next approved window

The commit containing this correction is not approved for main or deployment. Complete the pending local Supabase onboarding run when WSL resources are available. After explicit approval of the new SHA, publish only that SHA under the private hold, then repeat successful one-time confirmation and PKCE redirect checks on HTTPS, including full Location query inspection with redacted values, protected cookies, password-page access, reuse rejection and logout. Resume remaining hosted acceptance and internal email-delivery/template verification before any external invitation. Keep worker scheduling false and stock source legacy. A beta recipient, company and explicit account list still require owner approval; no invitation has been sent.
