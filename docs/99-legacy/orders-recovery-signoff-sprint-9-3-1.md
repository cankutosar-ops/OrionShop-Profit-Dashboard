# Sprint 9.3.1 — Orders Recovery Validation & Production Sign-off

**Date:** 2026-07-24  
**Account:** `1`  
**Recovery window:** 2026-07-13 → 2026-07-24  
**Scope:** Validation and production sign-off only (no schema/business-logic changes in this sprint)

---

## 1. Migration status

| Item | Result |
|------|--------|
| Migration | `20260712200000_wb_orders_price_with_disc.sql` |
| Applied by | Production (confirmed prior to this sprint) |
| `wb_orders.price_with_disc` | **PRESENT** |
| `wb_orders.last_change_date` | **PRESENT** |

---

## 2. Schema compatibility result

Command: `npm run validate:schema-compatibility`

```
[schema-compatibility] OK — application schema requirements are present.
OK: schema compatible with application requirements.
EXIT:0
```

| Check | Status |
|-------|--------|
| Schema Compatibility | **PASS** |
| `wb_orders.price_with_disc` | OK |
| `wb_orders.last_change_date` | OK |
| `wb_sales.price_with_disc` | OK |
| `wb_sales.for_pay` | OK |

Evidence: `exports/browser-proof/sprint-9-3-orders-recovery/schema-compatibility.json`

---

## 3. Orders recovery summary

Command: `npx tsx scripts/recover-orders-gap-sprint-9-3.mjs --account 1 --from 2026-07-13 --to 2026-07-24`

| Entity synced | Orders only |
|---------------|-------------|
| Sales / Finance / Inventory synced | **No** |
| Upsert errors | **None** (`errors: []`) |
| Rows processed / updated | 335 / 335 |

Evidence: `exports/browser-proof/sprint-9-3-orders-recovery/recovery-report.json`

---

## 4. Recovered record count (before → after)

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total `wb_orders` | 2 974 | 3 225 | **+251** |
| Rows with `order_date` in window | **0** | **237** | **+237** |

Note: Sync also upserted change-date updates for rows outside the order-date window (335 filtered payloads); net new order-date coverage in the gap is **237**, matching API.

---

## 5. Latest Orders date

| Source | Latest `order_date` |
|--------|---------------------|
| Database (before) | 2026-07-12 |
| Database (after) | **2026-07-24** |
| Wildberries API (window) | **2026-07-24** |
| Match | **Yes** |

---

## 6. Gap status

| Check | Result |
|-------|--------|
| Gap window DB count vs API order-date count | **237 = 237** |
| Remaining missing order-date rows in window | **0** |
| Gap status | **CLOSED** |

---

## 7. Sample recovered SRIDs

Probe: 25 API sample SRIDs with `order.date` in window → **25/25 present** in DB (`missingFromDb: 0`).

Examples now in database:

| srid | order_date | price_with_disc | last_change_date |
|------|------------|-----------------|------------------|
| `e1.ra1f77bcea5c14bf988d3b70eeee7df85.0.0` | 2026-07-13 | 7200 | 2026-07-13 |
| `eA8.rcdc39759fcda4e86bd3407d7e7a91cfc.0.0` | 2026-07-14 | 7200 | 2026-07-15 |
| `eAL.rcb81de85eb124786901234a1a80bb460.0.0` | 2026-07-15 | 6960 | 2026-07-15 |
| `eAm.r780c33004c4146e8a30a35eb07335dbb.0.0` | 2026-07-13 | 7200 | 2026-07-13 |
| `eAM.rf671b05adf7d4eb48cb0b4855a0bee53.0.0` | 2026-07-13 | 7200 | 2026-07-15 |

---

## 8. Orders pipeline result (second normal sync)

Command: `npx tsx scripts/validate-orders-recovery-sprint-9-3-1.mjs`

| Check | Result |
|-------|--------|
| Upsert failures | **None** |
| Schema / missing-column errors | **None** |
| Processed / updated | 335 / 335 |
| Pipeline completes successfully | **Yes** |

Evidence: `exports/browser-proof/sprint-9-3-orders-recovery/pipeline-regression.json`

---

## 9. Regression summary

No Sales / Finance / Inventory / Dashboard / Financial Engine code changes in this sprint. Extents after Orders-only recovery:

| Area | Observation |
|------|-------------|
| Sales | Present; window rows **55**; latest **2026-07-22** (unchanged by this sprint) |
| Finance | Present; window rows **1 649**; latest **2026-07-19** |
| Inventory | Present; **1 077** stock rows; latest sync stamp **2026-07-09** (known pre-existing stock lag; not in scope) |
| Dashboard / Financial Engine / Reporting / Executive Rules / Marketplace Intelligence | Not modified; consume existing tables — Orders data now available for Jul 13–24 |

---

## 10. Final production health assessment

| Success criterion | Verified |
|-------------------|----------|
| Schema Compatibility = PASS | ✓ |
| Orders recovery completed successfully | ✓ |
| Gap window fully recovered (API count = DB count) | ✓ |
| Latest Orders date matches API | ✓ (2026-07-24) |
| Sample missing SRIDs now exist | ✓ (25/25) |
| Orders synchronization completes without errors | ✓ |
| No regressions introduced by this sprint | ✓ |
| Production DB and application schema synchronized | ✓ |

### Verdict

**PRODUCTION SIGN-OFF: PASS**

The Sprint 9.2 root cause (missing `wb_orders` columns) is resolved. Missing Orders for 2026-07-13→2026-07-24 are recovered. Orders upserts complete with zero errors. Application and database schema are compatible.

---

## Evidence index

| Artifact | Path |
|----------|------|
| Schema compatibility | `exports/browser-proof/sprint-9-3-orders-recovery/schema-compatibility.json` |
| Recovery report | `exports/browser-proof/sprint-9-3-orders-recovery/recovery-report.json` |
| Pipeline + regression | `exports/browser-proof/sprint-9-3-orders-recovery/pipeline-regression.json` |
| This sign-off | `docs/orders-recovery-signoff-sprint-9-3-1.md` |
