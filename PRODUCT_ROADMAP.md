# Product Roadmap

## Completed

- ✅ **Sprint 1** — Dashboard + Wildberries sync foundation (v0.1.0)
- ✅ **Sprint 2** — SKU / stock infrastructure (v0.2.0)
- ✅ **Sprint 3** — Company & Marketplace Foundation (v0.3.0)

## Next

| Sprint | Theme | Version |
|--------|-------|---------|
| **Sprint 4** | Inventory Management | v0.4.0 |
| **Sprint 5** | Data Validation | v0.5.0 |
| **Sprint 6** | Decision Engine | v0.6.0 |
| **Sprint 7** | Forecast | v0.7.0 |
| **Sprint 8** | Ozon | v0.8.0 |
| **Sprint 9** | Lamoda | v0.9.0 |

## Sprint 4 Preview — Inventory Management

- Dedicated inventory screen (see `docs/inventory-architecture.md`)
- Recommended stock, days of cover, alerts
- Stock intelligence separated from Product Analytics (PA keeps read-only Current Stock)

## Architecture Principles (post–Sprint 3)

- One **company** → many **marketplace accounts**
- All marketplace data scoped by `marketplace_account_id`
- API keys encrypted; never exposed to client
- New marketplaces = new account rows, not schema redesigns
