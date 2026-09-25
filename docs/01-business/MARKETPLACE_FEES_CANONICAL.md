# Marketplace Fees canonical contract

This contract separates three values that were previously conflated.

## Marketplace Fees

Marketplace Fees are the broad WB fee/service burden recorded in Finance. The formula is explicit and suffix-based:

`abs(commission) + abs(acquiring_fee) + abs(ppvz_reward) + abs(ppvz_vw) + abs(vw_nds)`

| Source suffix | Finance category | Economic meaning | Included |
| --- | --- | --- | --- |
| `commission` | `COMMISSION` | WB commission evidence | Yes |
| `acquiring_fee` | `ACQUIRING` | Payment acquiring | Yes |
| `ppvz_reward` | `PPVZ_REWARD` | WB reward/service component | Yes |
| `ppvz_vw` | `PPVZ_VW` | WB remuneration base | Yes |
| `vw_nds` | `PPVZ_VW_NDS` | VAT on WB remuneration | Yes |
| `logistics`, `return_logistics` | logistics categories | Delivery/returns | No; owned by Logistics |
| `storage` | `STORAGE` | Storage | No; owned by Storage |
| `acceptance` | legacy `OTHER` | Acceptance | No; suffix ownership overrides broad category |
| `penalty` | `PENALTY` | Penalties | No |
| `deduction` | `ADJUSTMENT` | Adjustments/holds | No |
| `additional_payment`, `cashback_discount` | `COMPENSATION` | Reimbursements/compensation | No |
| Finance Coverage V2 review/inactive suffixes | dedicated evidence categories | Evidence pending separate approval | No |
| any other `OTHER` row | `OTHER` | Mixed/unknown ownership | No |

Account totals are calculated independently from all account-scoped Finance rows. Product, category, and brand values include only fee rows with defensible product identity. The difference is reported as unattributed; it is never allocated by guesswork.

## WB Remuneration

WB Remuneration is the narrow signed metric:

`raw_amount(ppvz_vw) + raw_amount(vw_nds)`

Its percentage is the signed result divided by Net Sales. When qualifying historical rows lack `raw_amount`, both value and percentage are unavailable with status `LEGACY_RAW_UNAVAILABLE`. Normalized absolute amounts are never used to invent the sign.

## Sales-to-Settlement Difference

`Net Sales − Sales API forPay`

This is a reconciliation metric. It is **not the same as** Marketplace Fees, WB Remuneration, Revenue, Acquiring, Logistics, Storage, Acceptance, or Adjustments.

## V4 boundary

Financial Engine V4 realized profit formulas remain unchanged. Marketplace Fees and WB Remuneration are presentation and analysis metrics because their components are already reflected before Finance Revenue. Tax keeps the underlying component categories; this total makes no legal deductibility decision.

Smart Pricing continues to use its isolated legacy Sales-to-Settlement proxy until the canonical fee denominator and a no-double-count backtest are approved. User-facing Smart Pricing labels identify that proxy explicitly.

## Production read-only reconciliation (2026-09-24)

The hosted database was read without mutation before implementation.

| Metric, RUB | Account 2, 2026-08-31..2026-09-20 | Account 1, 2026-09-14..2026-09-20 |
| --- | ---: | ---: |
| Net Sales | 591,520.05 | 164,562.84 |
| Sales-to-Settlement Difference | 257,236.05 | 71,752.83 |
| Marketplace Fees | 168,650.19 | 26,949.21 |
| Commission | 68,699.91 | 8,714.06 |
| Acquiring | 19,672.12 | 5,683.44 |
| WB Reward / Service | 14,248.82 | 3,361.02 |
| WB Remuneration base (magnitude) | 66,029.34 | 9,190.69 |
| WB Remuneration VAT (magnitude) | 0.00 | 0.00 |
| Logistics + Return Logistics | 99,180.06 | 30,423.96 |
| Storage | 2,666.11 | 475.01 |
| Acceptance | 1,580.00 | 60.00 |
| Adjustments | 36,478.99 | 0.00 |

The explicit Marketplace Fees components sum exactly to the account totals above. The separately owned Logistics, Storage, Acceptance, and Adjustments values do not enter that sum. Signed WB Remuneration is `LEGACY_RAW_UNAVAILABLE` in production because the approved Finance Coverage V2 `raw_amount` migration remains unapplied.
