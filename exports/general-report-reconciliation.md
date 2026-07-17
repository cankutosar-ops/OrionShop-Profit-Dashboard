# General Report Reconciliation — Accounting Proof

Generated: 2026-07-11T13:57:14.414Z
Tolerance: ±0.01 RUB
Excel: `C:\Projects\OrionShop-Profit-Dashboard\exports\general-financial-report.xlsx` (20 rows)
Finance: `C:\Projects\OrionShop-Profit-Dashboard\exports\wb-raw-2026-06-30_2026-07-05\finance.json` (0 rows)

## Evidence notes

- Excel row count: 20; Finance row count: 0
- Excel sale dates: 2026-06-30, 2026-07-01, 2026-07-04, 2026-07-05
- Finance rr_dt/sale_dt range: ? → ?
- Row count mismatch between Excel and finance.json

# Exact Field Matches

## Canonical column mapping (Excel header → mapped finance field)

| Excel column | Finance field | Excel total | Finance total | Diff |
| --- | --- | ---: | ---: | ---: |
| Возмещение за выдачу и возврат товаров на ПВЗ | `ppvz_reward` | 0 | 0 | 0 |
| Общая сумма штрафов | `penalty` | 0 | 0 | 0 |
| Возмещение издержек по перевозке/по складским операциям с товаром | `rebill_logistic_cost` | 0 | 0 | 0 |

## Cross-field exact totals (0.00 = 0.00): 69 pairs _(see JSON for full list)_

# Exact Row Matches

_None._
## Unmatched Excel rows

- Row 1: SRID `eBR.if829c8b4fd844240250ec4ae0012d7e1.5.0`, Логистика, barcode 8684592382878, sale 2026-06-30, amount 121.51
- Row 2: SRID `eBR.if829c8b4fd844240250ec4ae0012d7e1.5.0`, Логистика, barcode 8684592382878, sale 2026-06-30, amount 49.45
- Row 3: SRID `eB1.if1a75c73ee1dbffa47682e39a065541a.0.0`, Логистика, barcode 8684592317672, sale 2026-06-30, amount 169.33
- Row 4: SRID `eB1.if1a75c73ee1dbffa47682e39a065541a.0.0`, Логистика, barcode 8684592317672, sale 2026-06-30, amount 69.8
- Row 5: SRID `ebr.r838c2f91717f4a3fb19c54dda5387c8f.0.0`, Логистика, barcode 8684592437486, sale 2026-07-01, amount 155.67
- Row 6: SRID `ebr.r838c2f91717f4a3fb19c54dda5387c8f.0.0`, Продажа, barcode 8684592437486, sale 2026-07-01, amount 2046.71
- Row 7: SRID `ebr.r838c2f91717f4a3fb19c54dda5387c8f.0.0`, Логистика, barcode 8684592437486, sale 2026-07-01, amount 62.57
- Row 8: SRID `ebr.r838c2f91717f4a3fb19c54dda5387c8f.0.0`, Возврат, barcode 8684592437486, sale 2026-07-01, amount 2046.71
- Row 9: SRID `e3.ib92e54531c8075c2837ac28caa7df350.0.0`, Логистика, barcode 8684592382830, sale 2026-07-01, amount 112.15
- Row 10: SRID `e3.ib92e54531c8075c2837ac28caa7df350.0.0`, Логистика, barcode 8684592382830, sale 2026-07-01, amount 49.45
- Row 11: SRID `eBA.r621b9ceb5ef9483aaa28f35e1d914773.0.0`, Логистика, barcode 8684592438346, sale 2026-07-04, amount 168.45
- Row 12: SRID `eBA.r621b9ceb5ef9483aaa28f35e1d914773.0.0`, Продажа, barcode 8684592438346, sale 2026-07-04, amount 2160.15
- Row 13: SRID `eAy.i2082b700007a6d773ca99d29f80769a3.0.0`, Логистика, barcode 8684592352987, sale 2026-07-05, amount 172.75
- Row 14: SRID `eAy.i2082b700007a6d773ca99d29f80769a3.0.0`, Логистика, barcode 8684592352987, sale 2026-07-05, amount 66.91
- Row 15: SRID `ebi.r5c154f714bf844319edd2f0d0e0544f7.0.0`, Логистика, barcode 8684592438360, sale 2026-07-05, amount 200.78
- Row 16: SRID `ebi.r5c154f714bf844319edd2f0d0e0544f7.0.0`, Логистика, barcode 8684592438360, sale 2026-07-05, amount 72.19
- Row 17: SRID `eA1.i3be7246487d5d1a0b30a738123c894be.8.0`, Логистика, barcode 8684592353007, sale 2026-07-05, amount 121.66
- Row 18: SRID `eA1.i3be7246487d5d1a0b30a738123c894be.8.0`, Логистика, barcode 8684592353007, sale 2026-07-05, amount 66.91
- Row 19: SRID `ebi.r8c4d1987b75a4fc3aeca067942406a55.0.0`, Логистика, barcode 8684592438377, sale 2026-07-05, amount 168.45
- Row 20: SRID `ebi.r8c4d1987b75a4fc3aeca067942406a55.0.0`, Продажа, barcode 8684592438377, sale 2026-07-05, amount 2160.08

# Fields With Constant Difference

_None among matched rows._

# Fields Requiring Formula

_Proven row-level equations (100% of matched rows, ±0.01 RUB)._

_None._

# Unknown Relationships

- Zero Excel SRIDs found in finance.json
- Finance API date range in export: ? → ?
- Zero Excel barcodes found in finance.json — possible different WB account or report scope
- Unmapped monetary Excel column: "№"
- Unmapped monetary Excel column: "Номер поставки"
- Unmapped monetary Excel column: "Код номенклатуры"
- Unmapped monetary Excel column: "Размер"
- Unmapped monetary Excel column: "Платформенные скидки, %"
- Unmapped monetary Excel column: "Размер кВВ, %"
- Unmapped monetary Excel column: "Размер кВВ без НДС, % Базовый"
- Unmapped monetary Excel column: "Итоговый кВВ без НДС, %"
- Unmapped monetary Excel column: "Размер компенсации платёжных услуг/Комиссии за интеграцию платёжных сервисов, %"
- Unmapped monetary Excel column: "Номер офиса"
- Unmapped monetary Excel column: "ШК"
- Unmapped monetary Excel column: "Фиксированный коэффициент склада по поставке"

# Field Total Differences (non-exact, canonical mapping)

| Excel column | Finance field | Excel total | Finance total | Diff |
| --- | --- | ---: | ---: | ---: |
| Цена розничная | `retail_price` | 11758.09 | 0 | 11758.09 |
| Вайлдберриз реализовал Товар (Пр) | `retail_amount` | 8413.65 | 0 | 8413.65 |
| Цена розничная с учетом согласованной скидки | `retail_price_withdisc_rub` | 11758.09 | 0 | 11758.09 |
| Вознаграждение с продаж до вычета услуг поверенного, без НДС | `ppvz_sales_commission` | 824.61 | 0 | 824.61 |
| Компенсация платёжных услуг/Комиссия за интеграцию платёжных сервисов | `acquiring_fee` | 210.11 | 0 | 210.11 |
| Вознаграждение Вайлдберриз (ВВ), без НДС | `ppvz_vw` | 824.61 | 0 | 824.61 |
| НДС с Вознаграждения Вайлдберриз | `ppvz_vw_nds` | 181.42 | 0 | 181.42 |
| К перечислению Продавцу за реализованный Товар | `ppvz_for_pay` | 7197.51 | 0 | 7197.51 |
| Услуги по доставке товара покупателю | `delivery_rub` | 1828.03 | 0 | 1828.03 |
