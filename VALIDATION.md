# Validation Status

Last updated: Sprint 5.3 — Production-safe validation

## Production-safe validation

Validation scripts must **never leave data in production marketplace accounts**.

### How it works

**Automatic cleanup after every run** — no schema changes, no markers:

1. Before validation: snapshot existing `product_cost_history` and `purchases` row IDs for the account
2. Run checks (may insert temporary rows)
3. In `finally`: delete every row created during the session

Implemented in `scripts/lib/validation-isolation.mjs` via `createValidationSession()`.

### Running validation

```bash
# Production account — requires BOTH env vars; cleanup runs automatically in finally
VALIDATION_ALLOW_PRODUCTION=1 VALIDATION_CONFIRM=YES npx tsx scripts/validate-cost-template.mjs 2

# Full suite + verification
VALIDATION_ALLOW_PRODUCTION=1 VALIDATION_CONFIRM=YES npx tsx scripts/run-production-safe-validation.mjs 2

# Guard logic only (no database)
npx tsx scripts/verify-validation-guard.mjs
```

Write-capable scripts call `assertProductionValidationAllowed()` before any database writes. On a production account, both variables are required:

- `VALIDATION_ALLOW_PRODUCTION=1`
- `VALIDATION_CONFIRM=YES`

Without both, the script exits immediately and performs no writes.

Account selection is centralized via `getValidationAccountId(accountId)` — today it returns the script argument unchanged.

### Legacy cleanup

One-time batch from `validate-cost-template.mjs` (2026-06-28) is removed by **insert timestamp window**, not by cost value:

```bash
npx tsx scripts/cleanup-cost-template-validation.mjs 2 --dry-run
npx tsx scripts/cleanup-cost-template-validation.mjs 2
npx tsx scripts/verify-no-synthetic-costs.mjs 2
```

### Scripts with automatic cleanup

| Script | Writes data | Cleanup |
|--------|-------------|---------|
| `validate-cost-template.mjs` | Yes | Session `finally` |
| `validate-cost-inline-edit.mjs` | Yes | Session `finally` |
| `validate-purchase-records.mjs` | Yes | Session `finally` |
| `validate-latest-cost-resolution.mjs` | No | Read-only |
| `ui-verify-cost-pa.mjs` | Yes (optional) | Snapshot cleanup after `after` phase |

---

## Module Validation

| Area | Status | Notes |
|------|--------|-------|
| ✓ Product Analytics | PASS | Calculations unchanged |
| ✓ Cost Management | PASS | Validation isolated via session cleanup |
| ✓ Purchases | PASS | Validation isolated via session cleanup |
| ✓ Smart Pricing | PASS | Uses scoped profitability inputs |
| ✓ Sync Performance | PASS | Batched upserts; account-scoped sync |
| ✓ Multi Marketplace Foundation | PASS | Companies, accounts, encryption |

## Typecheck

```bash
npx tsc --noEmit
```

**Result: PASS**
