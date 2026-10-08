# Ozon integration — implementation architecture

Status: source capture, DB-only financial component/P&L providers, optional encrypted Performance credentials, and four additive source migrations are prepared locally on 2026-10-06. Empty finance is expected for the owner-confirmed new store and does not block connection acceptance. Ozon production migrations, actual account/credential connection, recurring worker activation and deployment have not occurred. End-to-end published Net Profit is not yet complete: realized costing, Ozon tax-basis adapters and period/publication verification still require implementation/acceptance. The source projection and evidence-gated profit arithmetic are implemented and tested; these are not a claim of live verified profitability.

## Progress verified on 2026-10-06

- Fresh read-only captures returned 14 catalog records, 14 price records and 14 stock records, each with complete two-page traversal. They remain in ignored local files; their fixture account ID is not a production Ozon account ID.
- The product view joins these independent snapshots by Ozon product ID. It shows offer ID, SKU, source price/currency and each supplied fulfillment/stock dimension. Decimal strings remain unchanged and finite source double prices are supported. The v5 `price.price` field is explicitly labelled as the price ceiling without promotions, not the customer-paid price. Missing evidence remains unavailable. Aggregated warehouse lists are not apportioned into invented individual warehouse quantities.
- Official current shipment methods are `/v3/posting/fbo/list` and `/v4/posting/fbs/list`. The retired FBO v2 method is not used. Both current methods expose root `postings`, `cursor`, and `has_next`. The reader follows the explicit completion flag, bounds pages, detects duplicate/non-progressing cursors and makes no automatic retry.
- The explicit source window 2026-09-28T00:00:00Z–2026-10-04T23:59:59Z returned one FBS posting, currently `delivering`, and no FBO postings. These are source-window/fulfillment facts, not realized Revenue or proof of financial completeness. Customer/addressee/address/legal data and financial estimates are excluded from the persisted posting projection.
- Migration `20261006082136_ozon_posting_source_foundation.sql` adds immutable source-window snapshots and exact account/scheme/window current pointers. An account-row lock serializes atomic publication; replay cannot replace a newer pointer, stale captures are rejected, and a failed publication retains the earlier snapshot. An explicitly completed empty shipment window is stored separately from missing/unavailable data.
- Docker tests execute all three actual migrations in an isolated database on the local Supabase PostgreSQL container, using the repository's real JWT company/account helpers and minimal account fixtures. They cover immutable grants, tenant isolation, replay, stale/foreign-account rejection, privacy rejection, failed-publication retention, empty newcomer finance, amount/identity preservation, lease contention/fencing/release and new-process persistence. This is not a complete restored-production-schema rehearsal. Production databases are not contacted by these tests.
- The local review at `http://localhost:3033` uses current real read-only source captures. It is an isolated development preview, not an authenticated production account or evidence that Ozon can already be selected in the live Dashboard. The normal Dashboard integration remains DB-only and resolves marketplace from the authorized account.
- Marketplace content is hidden during account changes or when URL company/account scope differs from the rendered payload. Brand, product and warehouse filters are cleared on account/company switches. This prevents a WB payload from remaining visible under a newly selected Ozon account.
- Server-only Ozon account readers use an explicitly versioned, account/company-bound AES-GCM credential envelope in the existing opaque `api_key_encrypted` column. `seller_id` is not reinterpreted as Client ID. The returned reader object contains functions and safe scope IDs, never plaintext/ciphertext credentials. Foreign, inactive or sync-disabled accounts are rejected. The WB credential helper rejects non-WB accounts before decryption. No production Ozon account or encrypted credential has been created.

### Updated financial source evidence

The official by-day schema distinguishes posting, item, seller-level and container accrual categories. `unit_number` can identify an order **or a service**, including an advertising contract; it is not unconditionally a posting number. `accrual_id` is described as an accrual identifier, but global event-key/revision semantics have not been established from nonempty live evidence. Component `type_id` and the accrual type dictionary must not silently become transaction deduplication keys.

The documented commission object separates final commission after discounts/markups, list commission, seller unit price, buyer price, realized sale amount, discount points and partner-program amounts. Final/list commissions must not both be counted as independent fees. Source total amounts and child components remain separate control/evidence values until reconciled. Nullable monetary objects stay unavailable, not zero.

The official day/cursor contract confirms the immutable requested date and 15-minute cursor lifetime; it still does not explicitly establish a financial terminal-page/completeness rule. Source readers now also preserve unsafe int64 identities as decimal strings. Read-only checks for every date September 28–October 5 returned empty accrual arrays. They are stored locally with `accountingComplete=false`; no zero-income/zero-fee report is published.

## Owner-approved product behavior

The Ozon account belongs to Orion Shop. The main Dashboard must let the user select Wildberries or Ozon and load the selected account's facts, reports and freshness only. Reuse the existing tenant/account selector (`tenant-selectors.tsx`), which already labels both marketplaces; account selection remains server-authorized, not a trusted client marketplace string. Clear incompatible brand/product filters and cancel stale responses when switching. Do not show the previous marketplace's cached metrics while the next account loads.

A later combined-company analysis screen is a separate feature. Prepare shared report contracts and explicit product mappings now; do not add combined totals to the individual marketplace Dashboard. Future comparisons must preserve currency, periods, return treatment, gross/net definitions and source completeness. Missing Ozon finance cannot appear as zero costs or verified profit.

## Source verification on 2026-10-02

Owner supplied local credentials; their values are never part of this document or repository. A bounded product request returned HTTP 200 and a catalog total of 14. Separate one-item requests to `/v5/product/info/prices` and `/v4/product/info/stocks` returned HTTP 200. Product-list items are under `result.items` with `last_id`; price/stock items are at root `items` with `cursor`. This live evidence validates response envelopes, not accounting semantics or all historical/warehouse coverage.

The legacy finance route `/v3/finance/transaction/list` returned HTTP 404. The [official Ozon changelog](https://t.me/s/OzonSellerAPI?before=685) confirms retirement on 2026-09-08 and replacements `/v1/finance/accrual/postings`, `/v1/finance/accrual/types`, `/v1/finance/accrual/by-day`. The type dictionary returned HTTP 200 with 132 entries. Bounded by-day probes for September 1, September 30 and October 1 returned empty accrual arrays. This does not prove no activity or finance completeness. Request semantics, nonempty item structure, financial signs and event identity still require current contract evidence.

The [June 9 official change](https://t.me/s/OzonSellerAPI?before=678) renamed `accruals.type_id` to `accruals.accrual_id`. Do not assume `accrual_id` is a globally unique transaction identity: that would risk collapsing multiple accruals of the same type.

Owner supplied the current by-day method description and response example on 2026-10-02. Requests contain exactly `date` (YYYY-MM-DD, earliest 2022-01-01) and `last_id` (empty initially). Subsequent pages retain the same date. Cursor lifetime is 15 minutes. The documented request does not contain `limit`, `page` or `page_size`; earlier one-item probe requests included an undocumented `limit`, so those reads are not evidence of a server-enforced one-item bound.

Implemented `finance-read-client.ts` binds each session to one immutable date, sends only documented request fields, checks cursor lifetime/repetition, blocks concurrent session reads, redacts errors and performs no retry after request failure. It preserves source values unchanged and exposes no accounting totals or completeness flag. The supplied excerpt does not define end-of-pagination semantics; a transport stop must not become a verified financial period.

### Accrual response evidence map

This is a source-preservation plan, not an implemented financial schema or approved accounting formula:

- `date`, `accrued_category`, `accrual_id`, `unit_number` → immutable accrual source metadata, account and capture scoped. Retain original item position until event-key semantics are proven. Repeated accrual IDs must survive.
- `total_amount.amount/currency` → exact source decimal text and currency; a control value whose relationship to subcomponents remains to be established. Do not convert to JavaScript float or add it to all children.
- `posting.delivery_schema/delivery_speed` → fulfillment metadata. `unit_number` linkage to posting/shipment requires field description; do not assume it is a posting number.
- `posting.products[].sku` → source SKU linkage, explicitly mapped to an Ozon product. Preserve multiple product entries and their positions; do not map to WB `nm_id`.
- Each product's `commission` object → separate source evidence for `bonus`, `coinvestment`, `commission`, `commission_ratio`, `sale_amount`, `sale_commission`, `sale_price`, `seller_price`. Names alone do not establish gross revenue, net revenue, deductibility, monetary sign or overlapping fields.
- Product `delivery.services[].type_id/accrued` and `delivery.total_accrued` → typed delivery components plus separate control total. Do not count both the total and each service as separate expenses. The example includes an empty `accrued` object; absent monetary evidence must remain unavailable, not zero.
- `item_fees.fees[].sku/fees[]` → SKU-linked fee evidence with source positions and type identifiers.
- `container_fees.fees[]` → container-level fee evidence. Allocation to product/SKU is not invented.
- `non_item_fee` → unallocated fee evidence; do not force product identity.
- Fee `type_id` → explicit relationship to verified accrual type dictionary only after its descriptions establish that relationship. Unknown types stay unclassified.

Still required for accounting: descriptions/enums for category and identity fields; commission/price/bonus/coinvestment meanings and signs; total/component relationships; shipment linkage; end-of-pagination rule; correction and return semantics. A JSON example demonstrates structure, not these business definitions.

Complete read-only captures of products, stocks and prices each returned 14 records and an empty second page; records were saved only under ignored `.audit/ozon-captures`. Live stock items include `type`, `present`, `reserved`, `sku`, `shipment_type`, `warehouse_ids`; supplied lists are preserved without distributing aggregate quantities among warehouses. Live price items contain commercial price, currency, VAT and commission estimates; these are not realized financial charges.

Implemented foundation: fixed-origin read client; bounded complete capture; injected database publisher; immutable `ozon_source_snapshots` and account/entity `ozon_source_current` pointer; atomic scoped publication RPC. Migration `20261002064725_ozon_source_capture_foundation.sql` is LOCAL ONLY and unapplied in production. An empty capture requires explicit review; failed pagination publishes nothing; stale captures cannot replace newer pointers; exact replay does not revert pointers. Snapshot publication serializes on the account row. This is not a durable worker lease/cursor implementation.

The main Dashboard resolves marketplace from the authorized account/company, uses a separate DB-only Ozon source-status view and does not display WB financial metrics for Ozon. Financial metrics remain unavailable until verified. The existing account selector is reused; connection creation remains disabled pending acceptance.

The original October 2 SQL tests used embedded PostgreSQL (PGlite) with a minimal authorization fixture. Docker is now available; the October 6 isolated local-Supabase PostgreSQL rehearsal extends this coverage as described above. Full restored-schema and production account/consumer acceptance remain separate release requirements.

## Existing integration boundaries

- `MARKETPLACE_TYPES` includes Ozon, but `MARKETPLACE_CONNECTABLE` only permits Wildberries. Keep that restriction until Ozon acceptance passes.
- `src/lib/warehouse/adapters/marketplace-adapter.ts` defines products, orders, sales, finance, stocks and prices. Its finance DTO is insufficient for component/item evidence and needs an additive Ozon-specific evidence contract.
- `src/lib/marketplace-adapters/index.ts` exports only WB implementations. The registry is not itself evidence of a working marketplace.
- `src/services/dashboard-service.ts` reads `wb_sales`, `wb_finance`, `wb_ads` and WB balance metrics. Adding an adapter alone will not enable Ozon reporting.
- `marketplace_accounts` already owns company/account scope and encrypted credentials. Account mutation routes enforce authorization; browser direct DML must stay denied.
- The current commercial worker calls WB commercial continuity and reads WB finance cursors. Ozon requires marketplace dispatch and its own durable state, not the WB cursor/recovery campaign.

## Planned persistence map

These table names are proposed additions, not existing tables. All financial amounts retain source currency and precision. Every fact is account scoped, linked to company through the account, and includes source identity, observation time and ingestion provenance.

- Account/credentials → existing `marketplace_accounts` with a versioned opaque encrypted Ozon envelope containing explicitly named Client ID/API key and account/company binding. The allocated account ID must be known before final credential binding; an account stays unavailable until controlled connection/setup acceptance. Do not reinterpret `seller_id` as Client ID. Never return credentials in account JSON.
- Product catalog → `ozon_products`, keyed by account and Ozon product ID; preserve offer ID and all supplied SKU identifiers in child identity records. Link to existing `products.id` through an explicit marketplace product mapping. Do not write Ozon IDs into WB `nm_id`/`chrt_id`.
- FBO/FBS/rFBS postings → `ozon_postings`, keyed by account, fulfillment scheme and posting number; product lines → `ozon_posting_lines`. Preserve order number separately. One posting is not necessarily one order or one unit.
- Status transitions → posting event evidence. Delivered postings are fulfillment evidence, not automatically verified financial revenue. Cancellation and returns remain separate events.
- Customer returns → `ozon_returns` and return lines, using the verified source return identity and event timestamps. Link to posting and product only where the source provides proof.
- Financial accruals → a future `ozon_finance_accruals` model whose key must be established from the new accrual contract. Do not implement the retired transaction API's operation-ID grain or use accrual type as event identity. Preserve source date/category, posting/product linkage and each signed amount/component when documented. Until this is proven, retain only reviewed local source evidence and publish no accounting totals.
- Financial service components → `ozon_finance_services`; financial product evidence → `ozon_finance_items`. Preserve source component positions/types. Do not distribute account-wide costs among SKUs without an explicit allocation policy.
- Settlement/cash-flow/reconciliation documents → `ozon_finance_reports` and typed report facts with report period, creation/publication evidence, status and import provenance. Financial transactions alone do not prove published report completeness.
- Current product prices → `ozon_current_prices`, keyed by account/product/currency and any documented price dimension. Prices are commercial information; never management Product Cost or purchase tax basis. No price history unless a consumer requires it.
- Current stock → `ozon_current_stocks`, keyed by account, supplied product/SKU identity, fulfillment scheme and supplied warehouse identity. Aggregated stocks with no warehouse ID remain explicitly aggregated; do not invent a warehouse.
- Inventory history → `ozon_inventory_snapshots` and a snapshot manifest. Record capture date/time and completeness. A successful complete capture atomically replaces only its account/snapshot scope; failure retains the previous valid snapshot.
- Advertising → `ozon_ads_daily` and campaign/product evidence, only after separately verifying Performance API authentication/coverage. Seller financial advertising charges and ad attribution/spend must be reconciled to avoid duplicate expense.
- Synchronization → `ozon_sync_state`, `ozon_sync_runs`, staged pages and completeness manifests. Durable account/entity/window cursors are updated in the same transaction as accepted rows.

## Ingestion and security

Use a server-only read-endpoint allowlist on the fixed official API origin. POST is a transport method, not permission to mutate seller settings. Exclude product creation, stock/price updates, shipment handling and every seller mutation endpoint.

Account credentials are loaded only after marketplace and company/account checks. Logs contain endpoint, HTTP status, stage, page and counts; never request headers, tokens, private payloads or customer personal data. Store only the minimum business evidence necessary for reconciliation, with a documented retention policy.

Every page is validated before persistence. Pagination must follow the endpoint's actual cursor/offset/page contract. A duplicate cursor, malformed page, inconsistent completeness proof, timeout or permission error cannot become success or zero activity. Rate limits and retry timing are endpoint specific; do not reuse WB's finance spacing without evidence.

Use durable leases and fencing per account/entity, bounded manual tasks and resumable progress. Backfill is windowed according to the verified API retention/window limits. Existing facts are upserted idempotently; corrections preserve provenance. No broad delete, cursor reset or historical rewrite.

RLS applies to every new public table. Anonymous access and authenticated DML are denied. Tenant/account SELECT is allowed only for authorized identities. Service-role persistence remains behind authorized routes/worker dispatch. Composite foreign keys and unique constraints prevent cross-account child links. Security-invoker views expose explicit safe columns.

## Dashboard and accounting reads

Introduce a marketplace-aware DB read provider selected from the scoped account's marketplace. WB continues through its existing provider unchanged. Ozon provider reads Ozon facts and emits explicitly defined commercial, financial, inventory and freshness models. Never make API calls during Dashboard/report reads.

Dashboard, P&L, settlement, product analytics, exports and freshness must use the same provider contracts. Unsupported metrics display unavailable with evidence status, never a misleading zero or a WB default commission percentage.

Preserve Financial Engine V4, canonical WB Marketplace Fees, Smart Pricing and management Product Cost. Ozon accrual/commission/service/settlement definitions require an independent reconciliation specification. Never sum settlement with gross sales, or deduct commissions already included in settlement a second time. Unknown operation types remain unclassified and visible as incomplete coverage. Tax recognition requires verified Ozon sale/return evidence; current WB-based tax recognition must not accept fabricated WB rows.

## Delivery and acceptance

1. Obtain and archive a dated official Seller/Performance API contract; confirm endpoint versions, identities, monetary signs, timestamps, pagination, permissions, limits and report semantics.
2. Add server-only read client and sanitized contract fixtures. Test errors/redaction, no unsafe endpoint dispatch, pagination bounds and source numeric validation.
3. Create additive migrations and local restored-DB rehearsal; test grants, RLS, ciphertext isolation, idempotency and account/child scope.
4. Add catalog/posting/return/finance/price/stock ingestion and bounded Ozon worker dispatch. No recurring activation by default.
5. Add DB-only providers and UI freshness, then reconcile reports and exports. Keep unknown accounting evidence fail closed.
6. Add safe connection UI for Client ID/API key, test with one account, then perform bounded manual initial capture with explicit target/window. Credentials become necessary here, earlier if available for contract probes.
7. Compare source totals/report control totals with persisted facts, prove no WB/cross-account mutation, atomic stock/snapshot replacement, released leases and coherent cursors. Only then enable Ozon connection availability.

Unresolved release requirements: production application of the locally rehearsed Ozon migrations and actual company/account connection; posting/return/report permission and fulfillment coverage; independent Ozon financial reconciliation; full consumer acceptance. Deployment and recurring worker activation remain separate controlled release actions. No Ozon facts have been written to production; no WB financial formulas or Tax Engine changes are included.

## New-store connection preparation — 2026-10-06

The owner confirms the Ozon store is new: empty financial accruals are expected, not a connection blocker. Verified source observations already contain 14 products/prices/stocks and one FBS shipment in `delivering`; the sampled finance dates returned no accruals. A shipment does not establish realized revenue.

Prepared connection flow: company administration/settings → choose Ozon → supply Client ID and API key → authorized `POST /api/ozon/connect`. The route checks the canonical company/account and administrator/manager role. It verifies credentials with one catalog request (an empty catalog is accepted), verifies durable schema availability, reserves an inactive/non-syncing account identity, then encrypts an explicitly account/company-bound envelope and activates that account. A failed finalization retains an inert account for scoped reconnect; it neither deletes it nor starts a worker. No existing default account changes. Client ID is not stored as a public seller ID. Successful reconnect replaces the bound credential envelope for the same Client ID; changing an existing account to another Ozon store is rejected. Generic WB credential updates reject Ozon. Connection presentation ignores the WB finance lifecycle for Ozon and does not wait for finance activity.

The intended company is Orion Shop (company 2), but the connection form always uses its authorized company, never a hard-coded cross-tenant default. Read-only production inspection confirms that company access is currently unrestricted within signed company claims for the owner administrator; no new Auth role or account grant is required for that administrator. Existing explicitly restricted users retain their restrictions. A new account ID will be allocated by the DB, not guessed.

Manual ingestion flow: Ozon Dashboard source selector → authorized `POST /api/ozon/sync` → one account/one task → durable account lease (five minutes) → bounded capture (five pages maximum) → fenced atomic publication → lease release. There is no recurring schedule, automatic retry, or WB lifecycle dispatch. A timed-out/failed capture leaves the prior published pointer unchanged. Leases expire after a terminated process; expired/superseded tokens cannot publish.

Durable storage now prepared:

- Products/prices/stocks: `ozon_source_snapshots` and account/entity `ozon_source_current`; preserve original product/SKU/stock dimensions. Price is the source ceiling, not realized Revenue or Product Cost.
- FBS/FBO shipments: `ozon_posting_source_snapshots` and account/scheme/exact UTC-window `ozon_posting_source_current`; only allowlisted shipment fields, no customer/address data.
- Daily finance observations: `ozon_accrual_source_snapshots` and account/day `ozon_accrual_source_current`. Entire bounded transport capture is published once; preserve decimal strings, int64 identifiers, nested fee components and repeated source row positions. Do not assume accrual ID is globally unique. Empty responses are durable `NO_ACCRUALS_REPORTED` observations. Nonempty responses become `SOURCE_ROWS_STORED`. Both remain `accounting_complete=false` until independent source reconciliation establishes accounting semantics. Unknown/unfetched dates and API failures never become zero activity.
- Concurrency: service-only `ozon_sync_leases` and `orion_acquire_ozon_sync`, `orion_release_ozon_sync`, `orion_publish_ozon_fenced_capture`. Source history is append-only; account/day current pointers can advance after a later valid observation.

Migration order (local only, none applied to hosted production):

1. `20261002064725_ozon_source_capture_foundation.sql`
2. `20261006082136_ozon_posting_source_foundation.sql`
3. `20261006101557_ozon_connection_sync_finance_sources.sql`
4. `20261006104253_ozon_financial_reference_sources.sql`

All new tables have RLS; authenticated readers use the existing signed company/account helper, anonymous access and authenticated writes are denied, and service source deletion is denied. Empty newcomer finance is accepted, but a later empty observation cannot replace a previously nonempty daily finance pointer without review: correction semantics have not been established. Docker rehearsal uses an isolated local Supabase PostgreSQL database with actual JWT helpers and minimal account fixtures, not a full production restore. It tests all three actual migrations, empty finance, replay, stale capture rejection, nonempty-to-empty protection, exact amount preservation, duplicate source positions, cross-account isolation, lease contention/fencing/release and unchanged WB sentinel.

Web/worker server requirements remain existing Supabase URL, server service-role key and `MARKETPLACE_CREDENTIALS_KEY`. Neither service key nor encryption key nor Ozon API key is `NEXT_PUBLIC_*`. Ozon credentials are submitted through authorized HTTPS server routes and stored encrypted; ignored local credential files are not deployed or committed. DB-only Dashboard reads never call Ozon live.

Final release must apply the four additive migrations, connect Orion Shop's Ozon account once, then accept one manual task at a time (products, prices, stocks, FBS/FBO window, expense dictionary, one finance day, a published realization month). Empty finance is a valid ingestion acceptance outcome for this new store; it does not require waiting for a sale before enabling the connection. Hosting deployment and recurring activation remain deferred. Finalized profitability, verified sale/return tax recognition, Performance report mapping and combined WB/Ozon analytics remain subsequent work, not fabricated from empty accruals or shipment state.

## Financial component and report implementation — 2026-10-06

Official references: [Seller finance methods](https://docs.ozon.ru/api/seller/#operation/GetFinanceAccrualByDay) and [Performance authentication/statistics](https://docs.ozon.ru/api/performance/#tag/Token). A fresh read-only expense dictionary request returned 132 vendor machine types. Classification uses explicit machine names and a pinned dictionary snapshot, not keyword guesses. Unrecognized types remain visible as unclassified; they block verified profit.

The fourth local migration adds immutable `ozon_financial_reference_snapshots` and current pointers, fenced publication and a scoped foreign key from each new daily finance capture to its dictionary revision. Later dictionary refreshes do not reinterpret old captures. Existing captures without pinned dictionaries retain unavailable fee classification. Monthly realization snapshots contain only period/currency/publication metadata, SKU/offer identity, realized/returned quantities and source monetary columns; fiscal names, tax identifiers and contract details are omitted.

`financial-reference-client.ts` uses `/v1/finance/accrual/types` and `/v2/finance/realization`. The monthly report documents delivered/returned goods and excludes cancellations; it becomes available in the following month. The separate daily realization method requires Premium Plus/Pro, so it is not assumed or used to force a plan upgrade. Month/identity/quantity validation fails closed, requests are bounded, and failures never replace prior data. Monthly quantities are only shown for a complete calendar-month filter, never assigned to invented sale dates within that month.

`finance-model.ts` projects source-position identities and exact decimal strings. It distinguishes sales, final commission, acquiring, delivery/return logistics, storage, acceptance, booked advertising, penalties, adjustments, compensation, other services, non-P&L balance movements and unknown components. `sale_commission`, seller/buyer unit prices, delivery totals and parent accrual totals are not additional charges. Signed service credits are preserved. Components must agree exactly with per-delivery and parent accrual controls before derived business cards show amounts. Unknown types, missing/nullable money, overlapping branches, FX currencies, duplicate identical raw rows and control mismatches keep profitability unverified; raw source evidence is retained.

`profit.ts` computes signed classified contribution minus evidenced realized Product Cost, evidenced tax and only reconciled unbilled advertising. Seller-booked advertising already contributes once; full Performance spend is never deducted again. Verified return-cost reversals may be negative. Trusted inputs must match the same account/period/currency and attest publication, costing, tax and ad reconciliation. Public routes currently provide no such verified inputs. Therefore the actual application still shows Net Profit/Product Cost/Tax as unavailable: the calculation core has been connected to the DB provider, but automatic realized-cost and tax-source adapters are unfinished. No Ozon marketplace price is used as Product Cost, and no WB/tax formula is changed.

Dashboard and P&L/Settlement/Reports entry points dispatch the authorized Ozon account to `OzonFinancePanel`/`OzonFinanceReport`, reading DB only. Generic WB report context refuses a non-WB account before loading WB calculations. CSV export uses the same account-scoped source model, includes observation status even for an empty capture, and escapes spreadsheet formulas. It exports source components, not an unsupported finalized P&L.

Performance credentials are optional, separately named Client ID/Client Secret inside the same account/company-bound encrypted envelope. Seller key rotation preserves the existing Performance pair when both new fields are blank. The company connection UI accepts the optional pair without returning secrets. `performance-read-client.ts` implements only a private expiring token and bounded read-only daily/expense JSON-report requests to `api-performance.ozon.ru`; no campaign, bid, budget or activation writes exist. Actual report row mapping/persistence remains blocked on separate credentials and a real sanitized response: the public documentation exposes only `contentType`, not the JSON row envelope. No Performance spend is inferred as zero or used twice in profit.

Current regression fixtures verify arithmetic/controls, exact decimals, returns/cost reversal, transfer exclusion, unknown/duplicate failure states, account scope and CSV formula protection. Fixtures are synthetic contract tests, not proof of a live nonempty financial report. Docker rehearsal checks four actual migrations, reference RLS/grants, replay, privacy, source fencing and historic dictionary pinning in a minimal isolated database. All production Ozon migrations remain unapplied; no deployment/push/recurring activation is part of this work.
