# Inventory numeric source diagnostics

This change reports source validation failures; it does not change numeric acceptance, fallbacks, mapping, or persistence. The production failure at release `8228ebe` identified only `Invalid stock number`. The offending field/value and root-cause class remain **F — UNKNOWN** until a separately approved diagnostic captures them.

## Existing validator contract (unchanged)

All six TypeScript response fields are numbers; quantity, warehouse ID, and transit fields are optional in the repository type. `nmId` and `chrtId` are required. The runtime accepts numeric strings when `Number(value)` is a safe integer satisfying the minimum. Fractions, non-finite numbers, unsafe integers and values below the minimum fail. Empty strings and booleans fail. Whitespace strings and arrays retain their existing JavaScript conversion behavior; this diagnostic change deliberately does not normalize or tighten them.

- `nmId`: nested value falls back to parent; safe integer ≥1. Null/undefined without a usable parent fails. Becomes snapshot `nm_id` and canonical `externalProductId` → `nm_id`.
- `chrtId`: nested value falls back to parent; safe integer ≥1. Null/undefined without a usable parent fails. Drives snapshot size/barcode lookup (or size identity fallback), and canonical `externalVariantId` → `chrt_id`.
- `warehouseId`: nested value falls back to parent; if non-null, safe integer ≥1. Null/undefined bypasses numeric validation and requires a warehouse name. Snapshot uses `warehouse_name`; canonical uses warehouse ID/key. Existing warehouse-ID output representation is unchanged.
- `quantity`: validates the selected warehouse row directly; safe integer ≥0. Null/undefined/empty fails; zero succeeds. Becomes snapshot/canonical `quantity`.
- `inWayToClient`: nested → parent → zero fallback; safe integer ≥0. Null/undefined therefore falls back; empty/fractional/negative fails. Becomes `in_way_to_client`.
- `inWayFromClient`: same fallback and validation as client transit; becomes `in_way_from_client`.

The snapshot mapper is reached only after the complete source passes validation. A numeric failure reaches neither snapshot mapping nor the atomic replacement RPC. No row is skipped to force acceptance.

## Diagnostic boundary

Errors include account context, endpoint, stage, zero-based item/warehouse indexes, source item count, effective numeric identities, field name, raw type, safe raw value, finite/integer/safe-integer flags, minimum and rejection reason. Only bounded numeric strings, numeric primitives, null/undefined markers and booleans are serialized. Arbitrary strings/objects are omitted. No raw response, warehouse-name text, headers, tokens or unrelated fields are included. The worker redacts the error before its CLI summary and structured logs.

Null fallback remains unchanged: diagnostics describe the effective value passed to the validator. A missing optional transit field does not produce a failure merely to log it.

## Source evidence and release gate

Repository references: [WB Analytics](https://dev.wildberries.ru/en/openapi/analytics), [endpoint release note](https://dev.wildberries.ru/en/news/302), and [existing source contract](inventory-atomicity-and-current-stock.md). Direct fetching of the two official pages failed during preparation; indexed official documentation confirmed the endpoint, current inventory, and one size per warehouse grain. Those excerpts do not establish the offending numeric field's semantics. The repository's assumptions are not proof that every production WB numeric value must satisfy them. No validator relaxation is inferred from HTTP 200.

Offline regression compares all six fields against the previous acceptance predicate, including null, undefined, empty/numeric strings, fractions, NaN/infinity, negatives, zero, integers, booleans and existing coercion edge cases. It also checks nested identity, omission of arbitrary payloads, and redaction through the real worker adapter.

Approval is required before publishing the new SHA to main and making exactly one Account 1 inventory-only bounded diagnostic request. No retry, Account 2, current-stock, Ads, recurring schedule, hosting or beta action is authorized by this preparation.
