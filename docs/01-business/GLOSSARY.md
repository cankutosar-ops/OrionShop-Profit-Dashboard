# Glossary

---

Status

Production

---

Owner

Product Owner

---

Audience

- Developers
- AI Assistants
- Product Owner

---

Module

—

---

Category

Business

---

Dependencies

- [Project DNA](../00-project/PROJECT_DNA.md)
- [Documentation Standard](../DOCUMENTATION_STANDARD.md)

---

Related Documents

- [Accounting Rules](./ACCOUNTING_RULES.md)
- [KPI Catalog](./KPI_CATALOG.md)
- [Business Model](./BUSINESS_MODEL.md)
- [Start Here](../09-onboarding/START_HERE.md)

---

Related ADRs

—

---

Related Widgets

—

---

Version

1.0.0

---

Last Updated

2026-07-28

---

Review Frequency

On introduction of new product vocabulary or naming conflicts

---

Source of Truth

This file

---

Purpose

Provide the project’s single authoritative vocabulary. Every later Knowledge Base document and product surface should use these canonical terms.

---

Scope

Business-first terminology already used in the product and Knowledge Base. Definitions describe meaning only — not implementation, interfaces, persistence, or formulas.

---

## How to use this glossary

1. Prefer the **canonical term** (section heading) in new writing and UI copy.
2. Treat **Aliases** as accepted historical or secondary names — do not invent additional synonyms.
3. When two ideas share a casual word (for example “Healthy” or “Purchases”), use the **qualified** canonical term.
4. Do not redefine these terms in other documents; link here instead.
5. Detailed accounting rules and KPI calculations belong in Accounting Rules and KPI Catalog — not here.

### Alias quick index (conflicts resolved)

| If you see… | Prefer… |
|-------------|---------|
| Commission / Marketplace Fees | [Marketplace Fee](#marketplace-fee) |
| Final Net Profit | [Net Profit](#net-profit) |
| Days of Stock / Days of Inventory / Days of Cover | [Days Left](#days-left) |
| Stock Value | [Inventory Value](#inventory-value) |
| COGS | [Product Cost](#product-cost) |
| Model Code | [Supplier Article](#supplier-article) |
| Profit Simulator / Decision Simulator | [Smart Pricing](#smart-pricing) |
| Account (in Settings / tenancy) | [Marketplace Account](#marketplace-account) |
| Settlement (cash transfer) | [WB Settlement](#wb-settlement) when meaning marketplace settlement |
| Purchases (chart / buyouts) | [Buyout](#buyout) — not the Purchases module |
| Healthy (stock timing) | [Stock Health](#stock-health) |
| Healthy (sync) | [Sync Verification](#sync-verification) |
| Snapshot (inventory history) | [Inventory Snapshot](#inventory-snapshot) |
| Informal “what the customer paid” language | [Customer Paid](#customer-paid) |

---

## Business entities

### Company

#### Definition

A commercial organization that owns one or more marketplace selling identities in the product. The top-level tenant boundary for seller operations.

#### Context

Settings, tenancy selection, multi-company scoping, and all marketplace data isolation.

#### Not To Be Confused With

- [Marketplace Account](#marketplace-account) — a selling identity under a company
- [Marketplace](#marketplace) — the platform type (for example Wildberries)

#### Aliases

- Companies (plural UI)

#### Related Terms

- [Marketplace Account](#marketplace-account)
- [Multi-Tenant Commercial Reality](#multi-tenant-commercial-reality)

---

### Marketplace Account

#### Definition

A single selling identity on a marketplace, belonging to one Company. Marketplace data and credentials are scoped to this account.

#### Context

Settings (account creation and keys), sync, reports, filters, and appendix attribution.

#### Not To Be Confused With

- [Company](#company) — the owning organization
- [Marketplace](#marketplace) — the platform, not the seller’s account row
- [Seller ID](#seller-id) — an optional marketplace identifier field, not the product account itself

#### Aliases

- Account
- Marketplace accounts (plural)

#### Related Terms

- [Company](#company)
- [Marketplace](#marketplace)
- [API Key](#api-key)
- [Sync](#sync)

---

### Marketplace

#### Definition

An external retail platform where the seller operates (for example Wildberries). In the product, also the platform type assigned to a Marketplace Account.

#### Context

Account setup, roadmap for additional platforms, report appendix, and marketplace-scoped vocabulary.

#### Not To Be Confused With

- [Marketplace Account](#marketplace-account)
- [Marketplace Fee](#marketplace-fee) — a financial cost concept, not the platform

#### Aliases

- Platform (informal)

#### Related Terms

- [Wildberries](#wildberries)
- [Marketplace Account](#marketplace-account)

---

### Brand

#### Definition

The commercial brand label associated with products in catalog and analytics views.

#### Context

Filters, inventory and profitability tables, Brand Intelligence, and reports.

#### Not To Be Confused With

- [Category](#category)
- [Model](#model)

#### Aliases

- Brands (plural)

#### Related Terms

- [Category](#category)
- [Product](#product)
- [Brand Intelligence](#brand-intelligence)

---

### Category

#### Definition

A product classification used to group commercial and inventory analysis.

#### Context

Category profitability, filters, inventory grouping, and Category Intelligence.

#### Not To Be Confused With

- [Brand](#brand)
- [Model](#model)

#### Aliases

- Categories (plural)

#### Related Terms

- [Brand](#brand)
- [Product](#product)

---

### Product

#### Definition

A sellable catalog item as understood by the seller and product surfaces. In tables and reports, “Product” often names the human-readable product title.

#### Context

Cost Management, Product Analytics, reports, inventory lists, and product-level profitability.

#### Not To Be Confused With

- [Model](#model) — the seller’s article-level grouping commonly used as the analytical parent
- [SKU](#sku) — a size- or barcode-level stock keeping unit
- [Supplier Article](#supplier-article) — the seller’s article identifier

#### Aliases

- Products (plural)
- Product Name (column label)

#### Related Terms

- [Model](#model)
- [SKU](#sku)
- [Supplier Article](#supplier-article)

---

### Model

#### Definition

The seller’s article-level commercial unit used as a primary grouping in inventory and many analytics views (commonly one Supplier Article with multiple sizes).

#### Context

Inventory lists and detail, inventory history pivots, Product Analytics model rows, and report “Models” language.

#### Not To Be Confused With

- [Product](#product) — display name / catalog sense
- [SKU](#sku) — finer grain (size / barcode)
- [Supplier Article](#supplier-article) — the identifier that usually keys a Model

#### Aliases

- Model Name
- Models (plural)

#### Related Terms

- [Supplier Article](#supplier-article)
- [SKU](#sku)
- [Size](#size)

---

### Supplier Article

#### Definition

The seller’s own article code that identifies a Model across cost, catalog, and analytics surfaces.

#### Context

Cost Management, product profitability, inventory identity, and imports that key unit cost by seller article.

#### Not To Be Confused With

- [Barcode](#barcode) — marketplace/item barcode
- [SKU](#sku) — may be used loosely in UI for product rows; prefer Supplier Article for the seller code
- [Seller ID](#seller-id) — account-level identifier, not an article code

#### Aliases

- Model Code
- Seller article (informal)

#### Related Terms

- [Model](#model)
- [Unit Cost](#unit-cost)
- [Product Cost](#product-cost)

---

### SKU

#### Definition

A stock-keeping unit at the grain used for size- or barcode-level inventory and some analytics expansions. Finer than Model.

#### Context

Product Analytics SKU rows, inventory expansions, report SKU columns, and stock-by-size views.

#### Not To Be Confused With

- [Model](#model) — parent article grouping
- [Supplier Article](#supplier-article) — seller article code (often shared by several SKUs)
- [Product](#product) — display/catalog sense

#### Aliases

- SKU / Product (combined column label in some inventory intelligence views)

#### Related Terms

- [Size](#size)
- [Barcode](#barcode)
- [Current Stock](#current-stock)

---

### Barcode

#### Definition

The item barcode used to distinguish specific size/pack rows in inventory and product detail.

#### Context

Inventory History, Product Analytics expansions, and warehouse-level stock identity.

#### Not To Be Confused With

- [Supplier Article](#supplier-article)
- [Size](#size)

#### Aliases

—

#### Related Terms

- [SKU](#sku)
- [Size](#size)
- [Warehouse](#warehouse)

---

### Size

#### Definition

The size (or technical size) dimension of a SKU within a Model.

#### Context

Inventory History columns, Product Analytics expansions, and size-level stock.

#### Not To Be Confused With

- [SKU](#sku) — the full stock unit that usually includes size
- [Barcode](#barcode)

#### Aliases

—

#### Related Terms

- [SKU](#sku)
- [Model](#model)

---

### Warehouse

#### Definition

A fulfillment location where marketplace stock is held or attributed. Used for inventory position, distribution, and warehouse sales analysis.

#### Context

Inventory modules, Warehouse Distribution, Warehouse Sales, history pivots, and settlement/operations context where location matters.

#### Not To Be Confused With

- [Historical Data Warehouse](#historical-data-warehouse) — the project’s data architecture concept
- [Company](#company) warehouse in the sense of seller’s own facility (FBS) unless explicitly scoped

#### Aliases

- Warehouses (plural)
- Warehouse name (display)

#### Related Terms

- [Current Stock](#current-stock)
- [Warehouse Distribution](#warehouse-distribution)
- [Warehouse Sales](#warehouse-sales)
- [FBW](#fbw)

---

### Seller ID

#### Definition

An optional marketplace seller identifier stored on a Marketplace Account for reference.

#### Context

Settings account details.

#### Not To Be Confused With

- [Marketplace Account](#marketplace-account)
- [Supplier Article](#supplier-article)

#### Aliases

- Seller (informal)

#### Related Terms

- [Marketplace Account](#marketplace-account)
- [API Key](#api-key)

---

### API Key

#### Definition

The credential that authorizes the product to synchronize data for a Marketplace Account.

#### Context

Settings, account setup, and sync eligibility. Treated as a secret.

#### Not To Be Confused With

- [Seller ID](#seller-id)

#### Aliases

—

#### Related Terms

- [Marketplace Account](#marketplace-account)
- [Sync](#sync)

---

## Financial concepts

### Commercial Performance

#### Definition

The product’s primary commercial profitability view for a selected period: the money-flow story from sales through expenses to profit used on the Dashboard and in related reporting.

#### Context

Dashboard Commercial Performance section, profitability breakdowns, Financial Intelligence content in reports, and the Financial Engine’s commercial model.

#### Not To Be Confused With

- [WB Settlement](#wb-settlement) — marketplace settlement / cash transfer view
- [Product Analytics](#product-analytics) — operational decision support, not the same as financial reporting
- [Smart Pricing](#smart-pricing) — forward simulation, not historical commercial reporting

#### Aliases

- Commercial Profit (engine language)
- Model B (internal / legacy label — do not use in new user-facing copy)

#### Related Terms

- [Financial Engine](#financial-engine)
- [Revenue](#revenue)
- [Net Profit](#net-profit)
- [Dashboard](#dashboard)

---

### Financial Engine

#### Definition

The project’s settled commercial calculation system that produces Commercial Performance results from warehouse facts and published business rules.

#### Context

Dashboard profitability, reports that reuse commercial results, Estimated Tax for historical reporting, and reconciliation language.

#### Not To Be Confused With

- [Smart Pricing](#smart-pricing) — a separate forward-looking model family
- [WB Settlement](#wb-settlement) — settlement presentation, not the commercial engine itself
- [Executive Rule Engine](#executive-rule-engine) — recommendation rules, not profit mathematics

#### Aliases

- Profit Engine (legacy informal)
- Financial Engine V4 / Commercial Performance V4 (versioned references)

#### Related Terms

- [Commercial Performance](#commercial-performance)
- [Reproducible Calculations](#reproducible-calculations)

---

### Gross Sales

#### Definition

The gross merchandise sales amount for completed sales in the selected period, before subtracting returned sales in the Commercial Performance display story.

#### Context

Dashboard Commercial Performance and related commercial narratives.

#### Not To Be Confused With

- [Revenue](#revenue) — seller payable / commercial revenue concept
- [Net Sales](#net-sales)
- [Customer Paid](#customer-paid)

#### Aliases

—

#### Related Terms

- [Returned Sales](#returned-sales)
- [Net Sales](#net-sales)
- [Units Sold](#units-sold)

---

### Returned Sales

#### Definition

The sales value associated with returns in the selected period — the amount refunded to customers in the Commercial Performance story.

#### Context

Dashboard returns metrics and returns analysis.

#### Not To Be Confused With

- [Return Logistics](#return-logistics) — logistics cost of returns
- [Returned Units](#returned-units) — unit count, not money
- [Return Rate](#return-rate)

#### Aliases

- Returned Value (some report copy)

#### Related Terms

- [Gross Sales](#gross-sales)
- [Net Sales](#net-sales)
- [Return](#return)

---

### Net Sales

#### Definition

Display sales after returns in the Commercial Performance story: Gross Sales minus Returned Sales. Used for seller-facing sales presentation; it is not a synonym for Revenue.

#### Context

Dashboard Commercial Performance.

#### Not To Be Confused With

- [Revenue](#revenue)
- [Net Profit](#net-profit)
- [Net Units](#net-units)

#### Aliases

—

#### Related Terms

- [Gross Sales](#gross-sales)
- [Returned Sales](#returned-sales)

---

### Revenue

#### Definition

In Commercial Performance, the seller’s marketplace payable amount for the selected period — the commercial top line from which operating costs and Estimated Tax are reasoned toward profit. Distinct from Gross Sales and Net Sales.

#### Context

Dashboard Revenue KPI, Commercial Performance breakdowns, and report financial sections that reuse the engine.

#### Not To Be Confused With

- [Gross Sales](#gross-sales) / [Net Sales](#net-sales) — sales presentation concepts
- [Seller Payout](#seller-payout) / [WB Settlement](#wb-settlement) — settlement cash concepts
- [Customer Paid](#customer-paid) — what customers paid the marketplace

#### Aliases

—

#### Related Terms

- [Commercial Performance](#commercial-performance)
- [Marketplace Fee](#marketplace-fee)
- [Operating Profit](#operating-profit)
- [Net Profit](#net-profit)

---

### Marketplace Fee

#### Definition

The marketplace’s fee take implied by the difference between sales and the seller’s for-pay amount in the commercial fee story. Shown as a Commercial Performance cost line. Informational relative to Net Profit when fee is already reflected before Revenue.

#### Context

Dashboard Commercial Performance, product profitability tables, and fee explanations.

#### Not To Be Confused With

- [Acquiring](#acquiring)
- [Penalties](#penalties)
- [Adjustments](#adjustments)
- [Acceptance](#acceptance)

#### Aliases

- Commission (still appears in some totals and older copy)
- Marketplace Fees (plural column label)

#### Related Terms

- [Revenue](#revenue)
- [Acquiring](#acquiring)
- [Commercial Performance](#commercial-performance)

---

### Product Cost

#### Definition

The cost of goods attributed to sold units for the period, based on the seller’s maintained unit costs.

#### Context

Commercial Performance, Cost Management, product profitability, and reports.

#### Not To Be Confused With

- [Unit Cost](#unit-cost) — per-unit cost input
- [Logistics](#logistics) — marketplace logistics, not COGS
- [Purchases](#purchases-module) — purchase records module

#### Aliases

- COGS (documentation / accounting shorthand)

#### Related Terms

- [Unit Cost](#unit-cost)
- [Cost Management](#cost-management)
- [Operating Profit](#operating-profit)

---

### Unit Cost

#### Definition

The per-unit product cost maintained for a Supplier Article (or equivalent cost key) and used to derive Product Cost.

#### Context

Cost Management (“Unit Cost”), cost imports, and cost history maintenance.

#### Not To Be Confused With

- [Product Cost](#product-cost) — period total attributed to sales
- [Sale Price](#sale-price)

#### Aliases

- Purchase cost (informal)

#### Related Terms

- [Supplier Article](#supplier-article)
- [Product Cost](#product-cost)
- [Cost Management](#cost-management)

---

### Logistics

#### Definition

Marketplace logistics costs attributed to the selected period in Commercial Performance and related analytics.

#### Context

Dashboard expense lines, Product Analytics logistics totals, and reports.

#### Not To Be Confused With

- [Return Logistics](#return-logistics)
- [Storage](#storage)
- [Acceptance](#acceptance)

#### Aliases

- Total Logistics (Product Analytics aggregate label)

#### Related Terms

- [Return Logistics](#return-logistics)
- [Storage](#storage)
- [Product Analytics](#product-analytics)

---

### Return Logistics

#### Definition

Logistics costs specifically associated with returns.

#### Context

Product Analytics and cost breakdowns that separate return logistics from forward logistics.

#### Not To Be Confused With

- [Logistics](#logistics) — general logistics line
- [Returned Sales](#returned-sales) — return merchandise value

#### Aliases

—

#### Related Terms

- [Logistics](#logistics)
- [Return](#return)

---

### Storage

#### Definition

Marketplace storage costs for the selected period.

#### Context

Commercial Performance, settlement views, and reports.

#### Not To Be Confused With

- [Logistics](#logistics)
- [Acceptance](#acceptance)

#### Aliases

—

#### Related Terms

- [Logistics](#logistics)
- [Acceptance](#acceptance)

---

### Acceptance

#### Definition

Marketplace acceptance (intake) operation costs for the selected period.

#### Context

Commercial Performance and finance-derived expense lines.

#### Not To Be Confused With

- [Storage](#storage)
- [Logistics](#logistics)

#### Aliases

—

#### Related Terms

- [Storage](#storage)
- [Penalties](#penalties)

---

### Penalties

#### Definition

Marketplace penalty amounts attributed to the selected period.

#### Context

Commercial Performance and settlement-related expense visibility.

#### Not To Be Confused With

- [Adjustments](#adjustments)
- [Marketplace Fee](#marketplace-fee)

#### Aliases

—

#### Related Terms

- [Adjustments](#adjustments)
- [WB Settlement](#wb-settlement)

---

### Adjustments

#### Definition

Marketplace financial adjustments for the selected period in Commercial Performance, including advertising and other marketplace holds as reflected in finance adjustments for that period.

#### Context

Dashboard Adjustments KPI and commercial expense narratives.

#### Not To Be Confused With

- [Advertising](#advertising) — may also appear as its own analytical line elsewhere; Adjustments is the Commercial Performance finance-adjustment bucket
- [Penalties](#penalties)
- [Marketplace Fee](#marketplace-fee)

#### Aliases

- Other Marketplace / Other Marketplace Costs (Product Analytics language)
- Other deductions / Deductions (settlement language)

#### Related Terms

- [Advertising](#advertising)
- [Operating Profit](#operating-profit)

---

### Acquiring

#### Definition

Payment acquiring fee shown for transparency in Commercial Performance. Already reflected before Revenue and not deducted again when computing Net Profit.

#### Context

Dashboard informational acquiring card and fee explanations.

#### Not To Be Confused With

- [Marketplace Fee](#marketplace-fee)
- [Revenue](#revenue)

#### Aliases

—

#### Related Terms

- [Marketplace Fee](#marketplace-fee)
- [Revenue](#revenue)

---

### Advertising

#### Definition

Advertising / marketing spend associated with selling activity. May appear as its own analytical line in product and report views; in Commercial Performance it is commonly included inside Adjustments when sourced from finance adjustments for the period.

#### Context

Product Analytics, product reports, advertising cost boards, and Adjustments explanations.

#### Not To Be Confused With

- [Adjustments](#adjustments) — the commercial bucket that can include advertising
- [Penalties](#penalties)

#### Aliases

- Advertising Cost
- Ads (informal)
- Marketing (informal)

#### Related Terms

- [Adjustments](#adjustments)
- [Product Analytics](#product-analytics)

---

### Estimated Tax

#### Definition

An operational estimate of tax exposure used in product decision support. The project intentionally maintains **two contexts** that must not be collapsed:

1. **Historical reporting (Financial Engine / Commercial Performance)** — tax estimate on completed sales based on [Customer Paid](#customer-paid).
2. **Smart Pricing** — tax estimate inside the forward price simulator, based on the simulated sale after Marketplace Fee.

Same term; different business questions; different bases by design.

#### Context

Dashboard Estimated Tax, Commercial Performance Net Profit, WB Settlement informational tax lines, and Smart Pricing simulation.

#### Not To Be Confused With

- Statutory tax filings or legal tax advice (out of product scope)
- [Tax Rate](#tax-rate) — the percentage input, not the money amount
- [WB Settlement](#wb-settlement) — tax shown near settlement is informational and not computed from settlement itself

#### Aliases

- Tax (short UI label)
- Tax estimate (informal)

#### Related Terms

- [Tax Rate](#tax-rate)
- [Customer Paid](#customer-paid)
- [Net Profit](#net-profit)
- [Smart Pricing](#smart-pricing)
- [Different Questions May Require Different Models](#different-questions-may-require-different-models)

---

### Tax Rate

#### Definition

The percentage applied when computing Estimated Tax in a given context (historical reporting or Smart Pricing).

#### Context

Dashboard tax subtitles, settings/tax inputs where present, and Smart Pricing.

#### Not To Be Confused With

- [Estimated Tax](#estimated-tax) — the resulting money amount

#### Aliases

- Tax%
- Tax percent

#### Related Terms

- [Estimated Tax](#estimated-tax)

---

### Customer Paid

#### Definition

The amount customers paid to the marketplace for relevant sales activity. Used as the historical reporting base for Estimated Tax on completed sales.

#### Context

Estimated Tax explanations, Commercial Performance tax hints, and dual-model documentation.

#### Not To Be Confused With

- [Revenue](#revenue) — seller payable concept
- [Gross Sales](#gross-sales) / [Net Sales](#net-sales)
- [Seller Payout](#seller-payout)

#### Aliases

- Customer paid to Wildberries (UI hint language)

#### Related Terms

- [Estimated Tax](#estimated-tax)
- [Returned Sales](#returned-sales)
- [Sale](#sale)

---

### Operating Profit

#### Definition

Commercial profit before Estimated Tax: Revenue after Product Cost, Logistics, Storage, Acceptance, Penalties, and Adjustments.

#### Context

Dashboard Commercial Performance.

#### Not To Be Confused With

- [Net Profit](#net-profit) — after Estimated Tax
- [Gross Profit](#gross-profit) — different, narrower/legacy chart language where used

#### Aliases

—

#### Related Terms

- [Net Profit](#net-profit)
- [Revenue](#revenue)
- [Estimated Tax](#estimated-tax)

---

### Net Profit

#### Definition

Commercial profit after Estimated Tax in Commercial Performance — the primary after-tax profitability KPI for historical reporting.

#### Context

Dashboard Net Profit KPI, category/product profitability, and report profit columns.

#### Not To Be Confused With

- [Operating Profit](#operating-profit) — before tax
- [Settlement Profit](#settlement-profit) — settlement-oriented profit framing
- [Revenue](#revenue)

#### Aliases

- Final Net Profit (table column label)

#### Related Terms

- [Operating Profit](#operating-profit)
- [Net Margin](#net-margin)
- [Commercial Performance](#commercial-performance)

---

### Gross Profit

#### Definition

A coarser profit presentation used in some charts and audit-style tables. Not a substitute for Operating Profit or Net Profit in Commercial Performance.

#### Context

Selected revenue/profit charts and audit tables.

#### Not To Be Confused With

- [Operating Profit](#operating-profit)
- [Net Profit](#net-profit)

#### Aliases

—

#### Related Terms

- [Net Profit](#net-profit)
- [Revenue](#revenue)

---

### Seller Payout

#### Definition

The seller’s payout figure used in settlement-oriented views and reconciliations — what the marketplace is understood to pay the seller for the settlement framing in use.

#### Context

WB Settlement widget and settlement reconciliation language.

#### Not To Be Confused With

- [Revenue](#revenue) — Commercial Performance payable top line
- [WB Settlement](#wb-settlement) — the broader settlement view
- [Estimated Cash After Tax](#estimated-cash-after-tax)

#### Aliases

- Seller Payout (FE) (qualified label in some reconciliations)
- After Tax Payout (when meaning Seller Payout minus Estimated Tax — use only when that qualification is explicit)

#### Related Terms

- [WB Settlement](#wb-settlement)
- [Estimated Tax](#estimated-tax)
- [Settlement Amount](#settlement-amount)

---

### WB Settlement

#### Definition

The product’s settlement-oriented view of marketplace payout and related settlement figures for a period. Distinct from Commercial Performance; used for settlement visibility and reconciliation, not as a replacement commercial P&L.

#### Context

WB Settlement widget, Settlement Reconciliation report sections, and settlement unavailable notices when marketplace weekly realization data is missing.

#### Not To Be Confused With

- [Commercial Performance](#commercial-performance)
- [Seller Payout](#seller-payout) — a line within or beside settlement, not the whole view
- [Business Report](#business-report) — Orion’s management document, not the marketplace’s weekly realization report

#### Aliases

- Settlement (short)
- Settlement view

#### Related Terms

- [Settlement Amount](#settlement-amount)
- [Seller Payout](#seller-payout)
- [Realization Report](#realization-report)

---

### Settlement Amount

#### Definition

The primary settlement total presented in settlement views and report settlement sections.

#### Context

WB Settlement and Settlement Reconciliation.

#### Not To Be Confused With

- [Seller Payout](#seller-payout)
- [Revenue](#revenue)

#### Aliases

—

#### Related Terms

- [WB Settlement](#wb-settlement)
- [Settlement Reconciliation](#settlement-reconciliation)

---

### Estimated Cash After Tax

#### Definition

Informational cash-after-tax figure shown near settlement by combining settlement framing with Financial Engine Estimated Tax. Not a second commercial P&L.

#### Context

WB Settlement informational lines.

#### Not To Be Confused With

- [Net Profit](#net-profit)
- [Seller Payout](#seller-payout)

#### Aliases

- Cash After Tax (short)

#### Related Terms

- [Estimated Tax](#estimated-tax)
- [WB Settlement](#wb-settlement)

---

### Settlement Profit

#### Definition

Profit framing associated with the settlement model family (historically labeled Model C). Not the default Commercial Performance Net Profit.

#### Context

Legacy model naming and settlement-oriented profit discussions.

#### Not To Be Confused With

- [Net Profit](#net-profit) under Commercial Performance
- [WB Settlement](#wb-settlement)

#### Aliases

- Model C (internal / legacy — avoid in new user-facing copy)

#### Related Terms

- [WB Settlement](#wb-settlement)
- [Commercial Performance](#commercial-performance)

---

### Net Margin

#### Definition

Net Profit expressed as a percentage margin for the selected scope.

#### Context

Reports and profitability tables.

#### Not To Be Confused With

- [Operational Margin](#operational-margin)
- [Financial Margin](#financial-margin)

#### Aliases

- Net Margin %
- Margin %
- Final Margin % (some tables)

#### Related Terms

- [Net Profit](#net-profit)
- [Operational Margin](#operational-margin)

---

### Operational Margin

#### Definition

Margin used in operational / pricing-health contexts (including target operational margin in Smart Pricing and Product Analytics).

#### Context

Product Analytics, Smart Pricing targets, pricing health.

#### Not To Be Confused With

- [Net Margin](#net-margin)
- [Financial Margin](#financial-margin)

#### Aliases

- Operational Margin %
- Target Operational Margin % (when referring to the target input)

#### Related Terms

- [Smart Pricing](#smart-pricing)
- [Target Margin](#target-margin)

---

### Financial Margin

#### Definition

Financial margin percentage shown in Product Analytics totals for financial-style margin reading.

#### Context

Product Analytics totals.

#### Not To Be Confused With

- [Operational Margin](#operational-margin)
- [Net Margin](#net-margin)

#### Aliases

- Financial Margin %

#### Related Terms

- [Product Analytics](#product-analytics)
- [Net Margin](#net-margin)

---

### Sale Price

#### Definition

The selling price used in cost, pricing, and simulation contexts (current average or recommended, depending on the surface).

#### Context

Cost Management, Smart Pricing, and pricing recommendations.

#### Not To Be Confused With

- [Customer Paid](#customer-paid) — historical customer payment basis
- [Revenue](#revenue)

#### Aliases

- Current Sale Price
- Current Avg Price
- Recommended Price (Smart Pricing output)
- Sale (simulator short label)

#### Related Terms

- [Smart Pricing](#smart-pricing)
- [Target Margin](#target-margin)
- [Markup on Cost](#markup-on-cost)

---

### Target Margin

#### Definition

The margin goal used by Smart Pricing when solving for a recommended selling price.

#### Context

Smart Pricing / Profit Simulator.

#### Not To Be Confused With

- [Net Margin](#net-margin) — realized historical margin
- [Operational Margin](#operational-margin) — broader operational margin language

#### Aliases

- Target Operational Margin %
- Target profit (documentation shorthand for the goal the simulator solves toward)

#### Related Terms

- [Smart Pricing](#smart-pricing)
- [Sale Price](#sale-price)

---

### Markup on Cost

#### Definition

Markup relative to product cost, used as a Smart Pricing / pricing metric.

#### Context

Smart Pricing metrics.

#### Not To Be Confused With

- [Target Margin](#target-margin)
- [Net Margin](#net-margin)

#### Aliases

- Markup on cost %

#### Related Terms

- [Unit Cost](#unit-cost)
- [Sale Price](#sale-price)

---

### Units Sold

#### Definition

Count of units sold in the selected period (operational metric).

#### Context

Dashboard Operational Metrics and related boards.

#### Not To Be Confused With

- [Orders](#order)
- [Net Units](#net-units)
- [Returned Units](#returned-units)

#### Aliases

—

#### Related Terms

- [Returned Units](#returned-units)
- [Return Rate](#return-rate)
- [Gross Sales](#gross-sales)

---

### Returned Units

#### Definition

Count of returned units in the selected period.

#### Context

Dashboard returns metrics and returns analysis.

#### Not To Be Confused With

- [Returned Sales](#returned-sales) — money
- [Return Rate](#return-rate)

#### Aliases

- Returned (short)

#### Related Terms

- [Units Sold](#units-sold)
- [Net Units](#net-units)
- [Return](#return)

---

### Net Units

#### Definition

Units sold net of returned units for the selected period.

#### Context

Dashboard operational metrics.

#### Not To Be Confused With

- [Net Sales](#net-sales)
- [Net Profit](#net-profit)

#### Aliases

—

#### Related Terms

- [Units Sold](#units-sold)
- [Returned Units](#returned-units)

---

### Return Rate

#### Definition

The rate of returns relative to sales activity for the selected scope.

#### Context

Dashboard, category/product boards, and reports.

#### Not To Be Confused With

- [Returned Sales](#returned-sales)
- [Returned Units](#returned-units)

#### Aliases

- Return %

#### Related Terms

- [Return](#return)
- [Returned Units](#returned-units)

---

### Order

#### Definition

A marketplace customer order. Operational counts typically emphasize non-cancelled orders where that distinction is stated.

#### Context

Dashboard Orders metric, orders/purchases charts, sync of orders, and inventory intelligence that may use orders for velocity proxies.

#### Not To Be Confused With

- [Sale](#sale) — completed sale / buyout event
- [Buyout](#buyout)
- [Purchases](#purchases-module) — the cost purchases module

#### Aliases

- Orders (plural)

#### Related Terms

- [Sale](#sale)
- [Buyout](#buyout)
- [Sync](#sync)

---

### Compensation

#### Definition

Marketplace compensation / reimbursement amounts treated separately from Marketplace Fee in financial classification.

#### Context

Finance classification and reconciliation notes.

#### Not To Be Confused With

- [Marketplace Fee](#marketplace-fee)
- [Adjustments](#adjustments)

#### Aliases

—

#### Related Terms

- [Adjustments](#adjustments)
- [WB Settlement](#wb-settlement)

---

## Inventory concepts

### Inventory

#### Definition

The product domain covering stock position, inventory history, warehouse distribution, and inventory intelligence for decision support.

#### Context

Inventory navigation and related modules.

#### Not To Be Confused With

- [Current Stock](#current-stock) — a metric within inventory
- [Historical Data Warehouse](#historical-data-warehouse) — architecture

#### Aliases

- Inventory Management
- Stock management (informal)

#### Related Terms

- [Current Inventory](#current-inventory)
- [Inventory History](#inventory-history)
- [Inventory Intelligence](#inventory-intelligence)

---

### Current Inventory

#### Definition

The Inventory area for the live / current stock position (as opposed to historical snapshots).

#### Context

Inventory navigation tab “Current Inventory”.

#### Not To Be Confused With

- [Inventory History](#inventory-history)
- [Current Stock](#current-stock) — the quantity metric
- [Current Snapshot](#current-snapshot)

#### Aliases

—

#### Related Terms

- [Current Stock](#current-stock)
- [Inventory Snapshot](#inventory-snapshot)

---

### Current Stock

#### Definition

The on-hand quantity currently attributed to a Model, SKU, or warehouse scope.

#### Context

Inventory lists, Product Analytics, Cost Management, and reports.

#### Not To Be Confused With

- [To Customer](#to-customer) / [From Customer](#from-customer) — in-transit quantities
- [Inventory Value](#inventory-value) — monetary value
- [Inventory Snapshot](#inventory-snapshot) — a dated capture

#### Aliases

- Stock
- Quantity (informal)

#### Related Terms

- [Days Left](#days-left)
- [Warehouse](#warehouse)
- [Low Stock](#low-stock)

---

### Current Snapshot

#### Definition

Filter/label language for the live inventory snapshot context in inventory views.

#### Context

Inventory filters.

#### Not To Be Confused With

- [Inventory Snapshot](#inventory-snapshot) — dated historical capture
- [Current Stock](#current-stock)

#### Aliases

—

#### Related Terms

- [Inventory Snapshot](#inventory-snapshot)
- [Current Inventory](#current-inventory)

---

### Inventory History

#### Definition

The module and views that present inventory across dated snapshots for historical comparison and investigation.

#### Context

Inventory History navigation and workspace.

#### Not To Be Confused With

- [Current Inventory](#current-inventory)
- [Sync Verification](#sync-verification) snapshots

#### Aliases

- Historical inventory (informal)

#### Related Terms

- [Inventory Snapshot](#inventory-snapshot)
- [To Customer](#to-customer)
- [From Customer](#from-customer)

---

### Inventory Snapshot

#### Definition

A point-in-time capture of inventory position for a date (daily inventory snapshot / historical inventory snapshot). Used so past stock can be reviewed without rewriting the present.

#### Context

Inventory History, daily snapshot operations, and historical warehouse practices.

#### Not To Be Confused With

- [Verification Snapshot](#verification-snapshot)
- [Profitability Snapshot](#profitability-snapshot)
- [Current Snapshot](#current-snapshot)

#### Aliases

- Daily Inventory Snapshot
- Historical Inventory Snapshot
- Snapshot (only when inventory history context is obvious)

#### Related Terms

- [Inventory History](#inventory-history)
- [Historical Data Warehouse](#historical-data-warehouse)
- [Historical Data Is Immutable In Spirit](#historical-data-is-immutable-in-spirit)

---

### To Customer

#### Definition

Quantity in transit toward the customer (outbound in-transit stock) for an inventory snapshot where that metric is available.

#### Context

Inventory History columns (typically for the latest live snapshot when transit is available).

#### Not To Be Confused With

- [From Customer](#from-customer)
- [Current Stock](#current-stock) — on-hand, not in transit

#### Aliases

—

#### Related Terms

- [From Customer](#from-customer)
- [Inventory Snapshot](#inventory-snapshot)

---

### From Customer

#### Definition

Quantity in transit returning from the customer (inbound in-transit stock) for an inventory snapshot where that metric is available.

#### Context

Inventory History columns (typically for the latest live snapshot when transit is available).

#### Not To Be Confused With

- [To Customer](#to-customer)
- [Returned Units](#returned-units) — sales returns count, not warehouse transit

#### Aliases

—

#### Related Terms

- [To Customer](#to-customer)
- [Inventory Snapshot](#inventory-snapshot)

---

### Warehouse Sales

#### Definition

Analytics of sales attributed by warehouse.

#### Context

Inventory / analytics navigation “Warehouse Sales”.

#### Not To Be Confused With

- [Warehouse Distribution](#warehouse-distribution) — stock distribution, not sales
- [Sale](#sale)

#### Aliases

- Warehouse Sales Analytics

#### Related Terms

- [Warehouse](#warehouse)
- [Warehouse Distribution](#warehouse-distribution)

---

### Warehouse Distribution

#### Definition

How current (or scoped) stock is distributed across warehouses for a Model or product scope.

#### Context

Inventory intelligence drawers and warehouse distribution panels.

#### Not To Be Confused With

- [Warehouse Sales](#warehouse-sales)
- [Sales Share](#sales-share)

#### Aliases

—

#### Related Terms

- [Warehouse](#warehouse)
- [Current Stock](#current-stock)
- [Sales Share](#sales-share)

---

### Warehouse Count

#### Definition

Count of distinct warehouses that hold stock for the scoped item.

#### Context

Inventory Intelligence tables.

#### Not To Be Confused With

- [Current Stock](#current-stock) — units, not warehouse cardinality

#### Aliases

—

#### Related Terms

- [Warehouse Distribution](#warehouse-distribution)

---

### Inventory Intelligence

#### Definition

Decision-support analysis of stock health, velocity, coverage, and related inventory signals at product/model scope.

#### Context

Inventory Intelligence navigation, tables, drawers, and related report inventory sections.

#### Not To Be Confused With

- [Product Intelligence](#product-intelligence) — broader product insight in Marketplace Intelligence
- [Product Analytics](#product-analytics)

#### Aliases

- Product Intelligence (drawer title in some inventory UX — prefer Inventory Intelligence for the module)

#### Related Terms

- [Stock Health](#stock-health)
- [Days Left](#days-left)
- [Recommended Stock](#recommended-stock)

---

### Inventory Value

#### Definition

Monetary value of inventory for a scope. May be unavailable when services do not expose a monetary valuation.

#### Context

Reports and Marketplace Intelligence inventory summaries.

#### Not To Be Confused With

- [Current Stock](#current-stock) — quantity
- [Product Cost](#product-cost) — cost of goods sold for a period

#### Aliases

- Stock Value
- Monetary Inventory Value (availability notices)

#### Related Terms

- [Current Stock](#current-stock)
- [Inventory Intelligence](#inventory-intelligence)

---

### Days Left

#### Definition

Estimated days of stock remaining at recent sell-through — the primary inventory coverage horizon metric in Inventory UI.

#### Context

Inventory model lists and detail (“Days Left”), inventory intelligence, and reports that show coverage.

#### Not To Be Confused With

- [Days Since Last Sale](#days-since-last-sale)
- [Stock Health](#stock-health) — classification from recency, not coverage days

#### Aliases

- Days of Stock
- Days of Inventory
- Days of Cover (roadmap / architecture language)

#### Related Terms

- [Current Stock](#current-stock)
- [Average Daily Sales](#average-daily-sales)
- [Recommended Stock](#recommended-stock)

---

### Recommended Stock

#### Definition

Suggested stock level for replenishment decision support.

#### Context

Inventory intelligence and inventory architecture decision aids.

#### Not To Be Confused With

- [Current Stock](#current-stock)
- [Days Left](#days-left)

#### Aliases

—

#### Related Terms

- [Days Left](#days-left)
- [Produce / Purchase](#produce--purchase)
- [Overstock](#overstock)

---

### Average Daily Sales

#### Definition

Average daily sales velocity used in inventory coverage and recommendation reasoning.

#### Context

Inventory intelligence calculations and explanations.

#### Not To Be Confused With

- [Units Sold](#units-sold) — period total
- [Sales Share](#sales-share)

#### Aliases

—

#### Related Terms

- [Days Left](#days-left)
- [Recommended Stock](#recommended-stock)

---

### Stock Difference

#### Definition

Difference signal used in inventory intelligence between observed stock and recommendation-oriented targets.

#### Context

Inventory intelligence services and views.

#### Not To Be Confused With

- [Current Stock](#current-stock)

#### Aliases

—

#### Related Terms

- [Recommended Stock](#recommended-stock)
- [Current Stock](#current-stock)

---

### Low Stock

#### Definition

Inventory display status indicating stock is low relative to operational thresholds.

#### Context

Inventory filters and status badges (Healthy / Low / Out).

#### Not To Be Confused With

- [Stock Health](#stock-health) value “At Risk” / “Slow” — different classification system
- [Out of Stock](#out-of-stock)

#### Aliases

—

#### Related Terms

- [Out of Stock](#out-of-stock)
- [Current Stock](#current-stock)
- [Inventory Status](#inventory-status)

---

### Out of Stock

#### Definition

Inventory display status indicating no available stock for the scoped item.

#### Context

Inventory filters and status badges.

#### Not To Be Confused With

- [Dead Stock](#dead-stock) — Stock Health class for non-moving inventory
- [Low Stock](#low-stock)

#### Aliases

- OOS

#### Related Terms

- [Low Stock](#low-stock)
- [Inventory Status](#inventory-status)

---

### Inventory Status

#### Definition

Simple on-hand availability status used in inventory lists: Healthy, Low Stock, or Out of Stock (as display statuses).

#### Context

Inventory filters and badges.

#### Not To Be Confused With

- [Stock Health](#stock-health) — recency/velocity health taxonomy
- [Sync Verification](#sync-verification) Healthy/Warning

#### Aliases

- Display status (informal)

#### Related Terms

- [Low Stock](#low-stock)
- [Out of Stock](#out-of-stock)
- [Stock Health](#stock-health)

---

### Stock Health

#### Definition

Inventory intelligence classification based primarily on days since last sale (dynamic signal): Healthy, Slow, At Risk, or Dead Stock.

#### Context

Inventory Intelligence tables, badges, and drawers.

#### Not To Be Confused With

- [Inventory Status](#inventory-status) — on-hand availability (Healthy/Low/Out)
- [Production Health](#production-health)
- [Sync Verification](#sync-verification) health

#### Aliases

—

#### Related Terms

- [Days Since Last Sale](#days-since-last-sale)
- [Dead Stock](#dead-stock)
- [Slow](#slow)
- [At Risk](#at-risk)

---

### Slow

#### Definition

Stock Health class indicating slow recent sell-through / aging signal.

#### Context

Stock Health.

#### Not To Be Confused With

- [Dead Stock](#dead-stock)
- [At Risk](#at-risk)

#### Aliases

—

#### Related Terms

- [Stock Health](#stock-health)

---

### At Risk

#### Definition

Stock Health class indicating elevated risk of stagnation based on recency signals.

#### Context

Stock Health.

#### Not To Be Confused With

- [Low Stock](#low-stock) — availability status
- [Dead Stock](#dead-stock)

#### Aliases

—

#### Related Terms

- [Stock Health](#stock-health)

---

### Dead Stock

#### Definition

Stock Health class for inventory with no meaningful recent sales activity.

#### Context

Inventory Intelligence chips and Stock Health.

#### Not To Be Confused With

- [Out of Stock](#out-of-stock)
- [Overstock](#overstock)

#### Aliases

—

#### Related Terms

- [Stock Health](#stock-health)
- [Days Since Last Sale](#days-since-last-sale)

---

### Overstock

#### Definition

Replenishment recommendation indicating stock is excessive relative to need.

#### Context

Inventory recommendation enums and decision aids.

#### Not To Be Confused With

- [Dead Stock](#dead-stock)
- [Stop Purchasing](#stop-purchasing)

#### Aliases

—

#### Related Terms

- [Recommended Stock](#recommended-stock)
- [Produce / Purchase](#produce--purchase)
- [Stop Purchasing](#stop-purchasing)

---

### Stop Purchasing

#### Definition

Replenishment recommendation to stop buying / producing for the scoped item.

#### Context

Inventory recommendations.

#### Not To Be Confused With

- [Overstock](#overstock)
- [Purchases](#purchases-module)

#### Aliases

- Stop (older architecture shorthand)

#### Related Terms

- [Produce / Purchase](#produce--purchase)
- [Overstock](#overstock)

---

### Produce / Purchase

#### Definition

Replenishment recommendation to produce or purchase additional stock.

#### Context

Inventory recommendations.

#### Not To Be Confused With

- [Purchases](#purchases-module) — the module for purchase records
- [Buyout](#buyout)

#### Aliases

- Produce
- Purchasing (recommendation shorthand)

#### Related Terms

- [Recommended Stock](#recommended-stock)
- [Stop Purchasing](#stop-purchasing)

---

### Sales Share

#### Definition

Share of sales or orders attributed to a warehouse within a distribution view. May be orders-based rather than revenue-based depending on the surface’s stated basis.

#### Context

Warehouse Distribution.

#### Not To Be Confused With

- [Warehouse Sales](#warehouse-sales)
- [Net Margin](#net-margin)

#### Aliases

- Order Share (when explicitly orders-based)

#### Related Terms

- [Warehouse Distribution](#warehouse-distribution)
- [Order](#order)

---

### Last Sale Date

#### Definition

The most recent date a sale was recorded for the scoped item.

#### Context

Inventory Intelligence.

#### Not To Be Confused With

- [Days Since Last Sale](#days-since-last-sale)

#### Aliases

—

#### Related Terms

- [Days Since Last Sale](#days-since-last-sale)
- [Stock Health](#stock-health)

---

### Days Since Last Sale

#### Definition

Number of days since Last Sale Date — input signal for Stock Health.

#### Context

Inventory Intelligence.

#### Not To Be Confused With

- [Days Left](#days-left) — coverage horizon, not recency

#### Aliases

—

#### Related Terms

- [Last Sale Date](#last-sale-date)
- [Stock Health](#stock-health)

---

### Total Sales

#### Definition

Period sales total shown in inventory intelligence (commonly order-based totals for the scoped period).

#### Context

Inventory Intelligence columns.

#### Not To Be Confused With

- [Gross Sales](#gross-sales) — Commercial Performance money metric
- [Sale](#sale)

#### Aliases

—

#### Related Terms

- [Order](#order)
- [Inventory Intelligence](#inventory-intelligence)

---

### Active Products

#### Definition

Count of products considered active in inventory / report inventory summaries.

#### Context

Report inventory summary cards.

#### Not To Be Confused With

- [Current Stock](#current-stock)

#### Aliases

—

#### Related Terms

- [Inventory](#inventory)
- [Product](#product)

---

### FBW

#### Definition

Fulfillment by Wildberries — marketplace-fulfilled stock path that is the product’s primary warehouse inventory orientation.

#### Context

Inventory model detail, supplies language, and stock architecture discussions.

#### Not To Be Confused With

- [FBS](#fbs)
- [Warehouse](#warehouse) as a location vs fulfillment model

#### Aliases

- Fulfillment by Wildberries (expanded)
- FBW supplies (inbound receipts under FBW)

#### Related Terms

- [Supplies](#supplies)
- [Warehouse](#warehouse)
- [FBS](#fbs)

---

### FBS

#### Definition

Seller-fulfilled (marketplace “mp” / seller warehouse) fulfillment path. Recognized in feasibility and architecture discussions; not the primary first-class Inventory UI path.

#### Context

Historical feasibility notes and fulfillment distinctions.

#### Not To Be Confused With

- [FBW](#fbw)

#### Aliases

- Seller warehouse fulfillment (informal)

#### Related Terms

- [FBW](#fbw)
- [Warehouse](#warehouse)

---

### Supplies

#### Definition

Inbound shipments / warehouse receipts that replenish FBW (or related) stock.

#### Context

Inventory model detail and sync/domain discussions of inbound stock.

#### Not To Be Confused With

- [Purchases](#purchases-module) — commercial purchase records for COGS
- [Order](#order)

#### Aliases

- FBW supplies
- Warehouse receipts
- Inbound shipments

#### Related Terms

- [FBW](#fbw)
- [Current Stock](#current-stock)

---

## Reporting and product surfaces

### Dashboard

#### Definition

The primary commercial home surface for period KPIs, Commercial Performance, and core profitability exploration.

#### Context

Main application home and report “dashboard explores” language.

#### Not To Be Confused With

- [Reports](#reports)
- [Product Analytics](#product-analytics)

#### Aliases

- Main Dashboard

#### Related Terms

- [Commercial Performance](#commercial-performance)
- [KPI](#kpi)

---

### Reports

#### Definition

The reporting / business intelligence workspace for scoped management documents, previews, and exports.

#### Context

Reports navigation and Marketplace Intelligence workspace.

#### Not To Be Confused With

- [Dashboard](#dashboard)
- [Realization Report](#realization-report) — marketplace weekly report
- [Business Report](#business-report) — a specific document type inside Reports

#### Aliases

- Reporting
- Business Intelligence (phase / workspace language)

#### Related Terms

- [Business Report](#business-report)
- [Excel Export](#excel-export)
- [Report Scope](#report-scope)

---

### Report Scope

#### Definition

The company, marketplace account, and date range (or period preset) that bound a report.

#### Context

Report empty states, headers, and generation requests.

#### Not To Be Confused With

- [KPI](#kpi)

#### Aliases

- Scope
- Scoped Date Range
- Period

#### Related Terms

- [Period Preset](#period-preset)
- [Business Report](#business-report)

---

### Business Report

#### Definition

Orion’s management Excel / document report for a scoped period — the primary multi-section business intelligence deliverable.

#### Context

Reports cards, preview, and Excel export.

#### Not To Be Confused With

- [Realization Report](#realization-report) — Wildberries weekly realization
- [Product Report](#product-report)

#### Aliases

- Management document (architecture language)
- Management Excel (legacy phrasing)

#### Related Terms

- [Reports](#reports)
- [Excel Export](#excel-export)
- [Executive Recommendations](#executive-recommendations)

---

### Product Report

#### Definition

Product-focused profitability report for a scoped period.

#### Context

Reports product report card and pages.

#### Not To Be Confused With

- [Business Report](#business-report)
- [Product Analytics](#product-analytics)

#### Aliases

- Product Profit report

#### Related Terms

- [Profitability Snapshot](#profitability-snapshot)
- [Product](#product)

---

### Executive Report

#### Definition

Executive-oriented report framing / section within the business intelligence preview (executive summary).

#### Context

Report preview navigation.

#### Not To Be Confused With

- [Executive Recommendations](#executive-recommendations)

#### Aliases

- Executive Summary

#### Related Terms

- [Business Report](#business-report)
- [Executive Recommendations](#executive-recommendations)

---

### Marketplace Intelligence

#### Definition

The multi-section intelligence workspace inside Reports that assembles executive, financial, brand, product, inventory, settlement, engagement, and appendix views for a scope.

#### Context

Reports hub and preview.

#### Not To Be Confused With

- [Inventory Intelligence](#inventory-intelligence)
- [Product Analytics](#product-analytics)

#### Aliases

- Marketplace Intelligence Workspace

#### Related Terms

- [Brand Intelligence](#brand-intelligence)
- [Product Intelligence](#product-intelligence)
- [Settlement Reconciliation](#settlement-reconciliation)

---

### Brand Intelligence

#### Definition

Brand-level insight section within Marketplace Intelligence / reports.

#### Context

Report preview Brands section.

#### Not To Be Confused With

- [Brand](#brand) — the entity
- [Product Intelligence](#product-intelligence)

#### Aliases

- Brands (section short name)

#### Related Terms

- [Marketplace Intelligence](#marketplace-intelligence)
- [Brand](#brand)

---

### Product Intelligence

#### Definition

Product-level insight section within Marketplace Intelligence / reports.

#### Context

Report preview Products section and related insights.

#### Not To Be Confused With

- [Inventory Intelligence](#inventory-intelligence)
- [Product Analytics](#product-analytics)
- [Product Report](#product-report)

#### Aliases

- Product Insights
- Products (section short name)

#### Related Terms

- [Marketplace Intelligence](#marketplace-intelligence)
- [Product](#product)

---

### Settlement Reconciliation

#### Definition

Report section that bridges commercial and settlement views for reconciliation reading.

#### Context

Marketplace Intelligence / preview Settlement section.

#### Not To Be Confused With

- [WB Settlement](#wb-settlement) — the widget/view
- [Commercial Performance](#commercial-performance)

#### Aliases

- Settlement bridge (informal)

#### Related Terms

- [WB Settlement](#wb-settlement)
- [Seller Payout](#seller-payout)

---

### Appendix

#### Definition

Report appendix section for scope, account, and supporting metadata.

#### Context

Business Report / preview final section.

#### Not To Be Confused With

—

#### Aliases

—

#### Related Terms

- [Report Scope](#report-scope)
- [Marketplace Account](#marketplace-account)

---

### Executive Recommendations

#### Definition

Deterministic rule-based recommendations for operators (not generative AI). Produced by the Executive Rule Engine for the scoped report.

#### Context

Marketplace Intelligence recommendations / insights sections.

#### Not To Be Confused With

- [Smart Pricing](#smart-pricing)
- [AI Collaboration](#ai-collaboration) — engineering assistants, not this recommendation engine

#### Aliases

- Recommendations
- Insights (informal)
- Executive Rule Engine output

#### Related Terms

- [Executive Rule Engine](#executive-rule-engine)
- [Marketplace Intelligence](#marketplace-intelligence)

---

### Executive Rule Engine

#### Definition

The deterministic rules system that emits Executive Recommendations from scoped metrics and thresholds.

#### Context

Reporting architecture and Marketplace Intelligence recommendations.

#### Not To Be Confused With

- [Financial Engine](#financial-engine)
- [Decision Engine](#decision-engine) — roadmap capability name

#### Aliases

—

#### Related Terms

- [Executive Recommendations](#executive-recommendations)
- [KPI](#kpi)

---

### Excel Export

#### Definition

Export of a report or workspace table to a spreadsheet workbook for offline use.

#### Context

Business Report download, Inventory History export, and Cost Management Excel import/export flows.

#### Not To Be Confused With

- [Business Report](#business-report) — the document being exported
- [Realization Report](#realization-report)

#### Aliases

- Export
- Workbook export

#### Related Terms

- [Reports](#reports)
- [Report Template](#report-template)

---

### Report Template

#### Definition

A versioned template that shapes how a Business Report (or related document) is assembled and rendered.

#### Context

Reporting architecture (draft / active / deprecated template lifecycle).

#### Not To Be Confused With

- [Knowledge Base](#knowledge-base) templates under documentation templates

#### Aliases

- Versioned template

#### Related Terms

- [Business Report](#business-report)
- [Excel Export](#excel-export)

---

### Period Preset

#### Definition

Named reporting period shortcut (for example weekly, monthly, quarterly, last six months, yearly, or custom).

#### Context

Report requests and date-range UX.

#### Not To Be Confused With

- [Report Scope](#report-scope) — full scope includes more than the preset

#### Aliases

—

#### Related Terms

- [Report Scope](#report-scope)

---

### KPI

#### Definition

A key performance indicator — a named metric used for decision support on dashboards and reports.

#### Context

Dashboard cards, Operational Metrics, report KPI strips, and quality discussions.

#### Not To Be Confused With

- [Glossary](#glossary-document) terms — KPIs have catalog detail elsewhere
- [Inventory Snapshot](#inventory-snapshot)

#### Aliases

- Metrics
- Operational Metrics (dashboard group label)

#### Related Terms

- [Commercial Performance](#commercial-performance)
- [Dashboard](#dashboard)

---

### Profitability Snapshot

#### Definition

A product-report heading for a scoped profitability summary. Not an inventory snapshot.

#### Context

Product Report pages.

#### Not To Be Confused With

- [Inventory Snapshot](#inventory-snapshot)
- [Verification Snapshot](#verification-snapshot)

#### Aliases

—

#### Related Terms

- [Product Report](#product-report)
- [Net Profit](#net-profit)

---

### Product Analytics

#### Definition

Operational P&L and decision-support analytics at product/model scope. Explicitly positioned as decision support, not a substitute for Commercial Performance financial reporting.

#### Context

Product Analytics navigation and pages.

#### Not To Be Confused With

- [Commercial Performance](#commercial-performance)
- [Product Intelligence](#product-intelligence)
- [Smart Pricing](#smart-pricing)

#### Aliases

- PA (short)
- Operational P&L (page description language)

#### Related Terms

- [Smart Pricing](#smart-pricing)
- [Logistics](#logistics)
- [Advertising](#advertising)

---

### Smart Pricing

#### Definition

Forward-looking price / profit simulator that solves selling price for a target margin using its own Estimated Tax base (sale after Marketplace Fee). Not historical Commercial Performance.

#### Context

Smart Pricing navigation, Profit Simulator panel, and pricing decision support.

#### Not To Be Confused With

- [Commercial Performance](#commercial-performance)
- [Estimated Tax](#estimated-tax) historical reporting context
- [Executive Recommendations](#executive-recommendations)

#### Aliases

- Profit Simulator
- Decision Simulator

#### Related Terms

- [Target Margin](#target-margin)
- [Sale Price](#sale-price)
- [Estimated Tax](#estimated-tax)
- [Different Questions May Require Different Models](#different-questions-may-require-different-models)

---

### Cost Management

#### Definition

The module for maintaining product unit costs that feed Product Cost in commercial calculations.

#### Context

Cost Management / Product Costs navigation and Excel cost import.

#### Not To Be Confused With

- [Purchases](#purchases-module)
- [Product Cost](#product-cost) — the derived period expense

#### Aliases

- Product Costs (page title)

#### Related Terms

- [Unit Cost](#unit-cost)
- [Supplier Article](#supplier-article)
- [Product Cost](#product-cost)

---

### Purchases (Module)

#### Definition

The module for seller purchase records used in cost/operations workflows (supplier purchases), distinct from marketplace buyouts.

#### Context

Purchases navigation and purchase imports.

#### Not To Be Confused With

- [Buyout](#buyout) — marketplace purchase/buyout events
- [Produce / Purchase](#produce--purchase) — replenishment recommendation
- Orders/Purchases chart labels that mean buyout activity

#### Aliases

- Purchases (unqualified UI — disambiguate in writing)

#### Related Terms

- [Supplier](#supplier)
- [Unit Cost](#unit-cost)
- [Buyout](#buyout)

---

### Supplier

#### Definition

The vendor from whom the seller buys goods in the Purchases module sense.

#### Context

Purchases import and purchase records.

#### Not To Be Confused With

- [Supplier Article](#supplier-article)

#### Aliases

—

#### Related Terms

- [Purchases](#purchases-module)
- [Unit Cost](#unit-cost)

---

### Production Health

#### Definition

Operational monitoring surface for sync coverage, verification posture, and production health alerts.

#### Context

Production Health navigation and monitoring panels.

#### Not To Be Confused With

- [Stock Health](#stock-health)
- [Inventory Status](#inventory-status)
- [Sync Verification](#sync-verification) — a component of health, not the whole surface

#### Aliases

—

#### Related Terms

- [Sync Verification](#sync-verification)
- [Coverage](#coverage)
- [Operational Alerts](#operational-alerts)

---

## Marketplace concepts

### Wildberries

#### Definition

The primary marketplace platform supported by the product today.

#### Context

Product identity, sync actions, settings marketplace type, and domain language.

#### Not To Be Confused With

- [Marketplace Account](#marketplace-account) on Wildberries
- [OrionShop](#orionshop) — this product

#### Aliases

- WB

#### Related Terms

- [Marketplace](#marketplace)
- [Sync Wildberries](#sync-wildberries)
- [FBW](#fbw)

---

### OrionShop

#### Definition

The product brand name for this Wildberries Profit Dashboard system.

#### Context

Product identity, exports, and documentation.

#### Not To Be Confused With

- [Wildberries](#wildberries)
- [Knowledge Base](#knowledge-base)

#### Aliases

- Wildberries Profit Dashboard
- WB Dashboard (informal)
- Orion (short in some export/bridge text)

#### Related Terms

- [Knowledge Base](#knowledge-base)
- [Project DNA](#project-dna)

---

### Sale

#### Definition

A completed marketplace sale event used in commercial and inventory reasoning.

#### Context

Sync of sales, intelligence “completed sales,” and Commercial Performance sales story.

#### Not To Be Confused With

- [Order](#order)
- [Buyout](#buyout) — closely related marketplace purchase framing; use Buyout when contrasting with orders chart language
- [Return](#return)

#### Aliases

- Sales (plural)
- Completed sales

#### Related Terms

- [Return](#return)
- [Customer Paid](#customer-paid)
- [Gross Sales](#gross-sales)

---

### Return

#### Definition

A marketplace return of a previously sold unit/value.

#### Context

Returned Sales, Returned Units, Return Rate, and return logistics.

#### Not To Be Confused With

- [From Customer](#from-customer) — warehouse transit
- [Return Logistics](#return-logistics)

#### Aliases

- Returns (plural)

#### Related Terms

- [Sale](#sale)
- [Returned Sales](#returned-sales)
- [Return Rate](#return-rate)

---

### Buyout

#### Definition

Marketplace buyout / purchase-by-customer framing used when contrasting orders with completed purchases in funnels and some chart labels.

#### Context

Orders vs purchases charts and buyout-oriented reporting language.

#### Not To Be Confused With

- [Purchases](#purchases-module) — seller’s COGS purchase module
- [Order](#order)
- [Sale](#sale)

#### Aliases

- Purchases (chart label — ambiguous; prefer Buyout in documentation)
- Buyouts

#### Related Terms

- [Order](#order)
- [Sale](#sale)

---

### Realization Report

#### Definition

Wildberries’ own weekly realization / settlement report artifact. External marketplace document — not Orion’s Business Report.

#### Context

Settlement unavailable notices and settlement data expectations.

#### Not To Be Confused With

- [Business Report](#business-report)
- [WB Settlement](#wb-settlement) — Orion’s presentation of settlement concepts

#### Aliases

- Weekly Report
- Weekly realization
- Weekly Detailed Report (related marketplace artifact name)

#### Related Terms

- [WB Settlement](#wb-settlement)
- [Settlement Amount](#settlement-amount)

---

### Product Engagement

#### Definition

Engagement metrics domain (favorites, cart, and related funnel signals). Often partially unavailable when marketplace engagement sync is not present.

#### Context

Marketplace Intelligence Engagement section and product engagement UI.

#### Not To Be Confused With

- [Product Analytics](#product-analytics)
- [Sales Funnel](#sales-funnel)

#### Aliases

- Engagement

#### Related Terms

- [Favorites](#favorites)
- [Cart](#cart)
- [Sales Funnel](#sales-funnel)

---

### Favorites

#### Definition

Marketplace “add to favorites” engagement signal.

#### Context

Product Engagement.

#### Not To Be Confused With

- [Cart](#cart)

#### Aliases

- Add to Favorites

#### Related Terms

- [Product Engagement](#product-engagement)
- [Cart](#cart)

---

### Cart

#### Definition

Marketplace “add to cart” engagement signal.

#### Context

Product Engagement.

#### Not To Be Confused With

- [Favorites](#favorites)
- [Order](#order)

#### Aliases

- Add to Cart

#### Related Terms

- [Product Engagement](#product-engagement)
- [Favorites](#favorites)

---

### Sales Funnel

#### Definition

Marketplace sales-funnel analytics concept spanning engagement and conversion signals.

#### Context

Engagement availability messaging and analytics roadmap language.

#### Not To Be Confused With

- [Commercial Performance](#commercial-performance)

#### Aliases

- Wildberries Sales Funnel Analytics (expanded)

#### Related Terms

- [Product Engagement](#product-engagement)
- [Order](#order)

---

## Architecture and synchronization

### Knowledge Base

#### Definition

The project’s documentation system of record under the docs architecture — identity, business meaning, architecture, modules, decisions, and standards.

#### Context

All durable documentation; AI and human onboarding.

#### Not To Be Confused With

- [Historical Data Warehouse](#historical-data-warehouse) — data, not docs
- Chat history or tickets — not authoritative

#### Aliases

- Documentation system of record
- Project Knowledge Base

#### Related Terms

- [Glossary Document](#glossary-document)
- [ADR](#adr)
- [Project DNA](#project-dna)

---

### Historical Data Warehouse

#### Definition

The architectural concept of preserving historical commercial and inventory reality for reporting, comparison, and investigation — independent of what the marketplace UI shows today.

#### Context

Architecture philosophy, inventory history, and long-horizon reporting.

#### Not To Be Confused With

- [Warehouse](#warehouse) — fulfillment location
- [Knowledge Base](#knowledge-base)

#### Aliases

- Historical Warehouse
- Warehouse (only in architecture prose — prefer the full term)

#### Related Terms

- [Inventory Snapshot](#inventory-snapshot)
- [Database-First Reporting](#database-first-reporting)
- [Historical Data Is Immutable In Spirit](#historical-data-is-immutable-in-spirit)

---

### Database-First Reporting

#### Definition

Principle that authoritative reporting reads from persisted warehouse facts rather than treating the presentation layer as a second ledger.

#### Context

Architecture philosophy and reporting design.

#### Not To Be Confused With

- [Single Source of Truth (Data)](#single-source-of-truth-data)

#### Aliases

—

#### Related Terms

- [Historical Data Warehouse](#historical-data-warehouse)
- [Financial Engine](#financial-engine)

---

### Single Source of Truth (Data)

#### Definition

Principle that the database / warehouse is the single source of truth for reporting numbers shown to users.

#### Context

Project DNA and architecture discussions.

#### Not To Be Confused With

- [Source of Truth (Documentation)](#source-of-truth-documentation) — metadata field naming the authoritative doc

#### Aliases

- Database is the single source of truth for reporting

#### Related Terms

- [Database-First Reporting](#database-first-reporting)
- [Historical Data Warehouse](#historical-data-warehouse)

---

### Source of Truth (Documentation)

#### Definition

Documentation metadata declaring which document or system is authoritative for a statement.

#### Context

Knowledge Base document headers.

#### Not To Be Confused With

- [Single Source of Truth (Data)](#single-source-of-truth-data)

#### Aliases

- Source of Truth (header field)

#### Related Terms

- [Knowledge Base](#knowledge-base)
- [Documentation Lifecycle](#documentation-lifecycle)

---

### Module

#### Definition

A product capability boundary with clear responsibilities (for example Dashboard, Inventory, Reports, Smart Pricing).

#### Context

Knowledge Base module docs and product navigation domains.

#### Not To Be Confused With

- [Widget](#widget)
- [Marketplace Account](#marketplace-account)

#### Aliases

- Product module

#### Related Terms

- [Widget](#widget)
- [Layer Separation](#layer-separation)

---

### Widget

#### Definition

A UI unit with a single job, documented under the widgets Knowledge Base layer and composed into modules.

#### Context

Widget documentation architecture and UI composition.

#### Not To Be Confused With

- [Module](#module)

#### Aliases

- UI widget

#### Related Terms

- [Module](#module)
- [Dashboard](#dashboard)

---

### Layer Separation

#### Definition

Architectural principle keeping business meaning, system structure, modules, presentation, and integrations distinct, connected by deliberate contracts.

#### Context

Architecture philosophy and Knowledge Base folder design.

#### Not To Be Confused With

—

#### Aliases

—

#### Related Terms

- [Module](#module)
- [Knowledge Base](#knowledge-base)

---

### Sync

#### Definition

The process of bringing marketplace data into the product warehouse for an account.

#### Context

Header sync actions, banners, monitoring, and account lifecycle.

#### Not To Be Confused With

- [Backfill](#backfill)
- [Sync Verification](#sync-verification)

#### Aliases

- Synchronize
- Syncing (in-progress UI)

#### Related Terms

- [Sync Wildberries](#sync-wildberries)
- [Incremental Sync](#incremental-sync)
- [Marketplace Account](#marketplace-account)

---

### Sync Wildberries

#### Definition

The primary user action to synchronize Wildberries data for the active account context.

#### Context

Application header / sync controls.

#### Not To Be Confused With

- [Backfill](#backfill) — historical catch-up mode
- [Verification Audit](#verification-audit)

#### Aliases

—

#### Related Terms

- [Sync](#sync)
- [Wildberries](#wildberries)

---

### Incremental Sync

#### Definition

Ongoing synchronization mode that advances the warehouse with controlled increments after historical backfill is complete.

#### Context

Account lifecycle and architecture philosophy.

#### Not To Be Confused With

- [Backfill](#backfill)
- [Sync](#sync) as a one-off button press

#### Aliases

- Incremental synchronization

#### Related Terms

- [Backfill](#backfill)
- [Account Lifecycle](#account-lifecycle)

---

### Backfill

#### Definition

Historical synchronization that loads past periods into the warehouse before or while establishing incremental sync.

#### Context

Account lifecycle stages and historical warehouse operations.

#### Not To Be Confused With

- [Incremental Sync](#incremental-sync)
- [Inventory Snapshot](#inventory-snapshot) capture jobs (related but not identical)

#### Aliases

- Historical backfill
- Finance history backfill (qualified)

#### Related Terms

- [Incremental Sync](#incremental-sync)
- [Historical Data Warehouse](#historical-data-warehouse)
- [Account Lifecycle](#account-lifecycle)

---

### Sync Verification

#### Definition

Read-oriented evaluation of whether synchronized marketplace data and warehouse coverage are healthy enough for trust — without mutating business facts as part of the check.

#### Context

Sync Verification panels, Production Health, and post-sync checks.

#### Not To Be Confused With

- [Stock Health](#stock-health)
- [Verification Snapshot](#verification-snapshot)
- [Inventory Status](#inventory-status) Healthy

#### Aliases

- Verification
- Verification Healthy / Warning (status labels)

#### Related Terms

- [Verification Audit](#verification-audit)
- [Coverage](#coverage)
- [Production Health](#production-health)

---

### Verification Snapshot

#### Definition

An immutable verification capture produced for audit/evaluation of sync posture.

#### Context

Sync verification audits and monitoring.

#### Not To Be Confused With

- [Inventory Snapshot](#inventory-snapshot)
- [Profitability Snapshot](#profitability-snapshot)

#### Aliases

- Verification audit snapshot (informal)

#### Related Terms

- [Sync Verification](#sync-verification)
- [Verification Audit](#verification-audit)

---

### Verification Audit

#### Definition

A run of automated verification evaluation (on demand or scheduled) against sync sources and coverage.

#### Context

Production Health “Run Verification Now” and automated verification audit language.

#### Not To Be Confused With

- [Sync](#sync) itself
- [Sync Verification](#sync-verification) — the capability; audit is an execution

#### Aliases

- Automated Verification Audit

#### Related Terms

- [Sync Verification](#sync-verification)
- [Verification Snapshot](#verification-snapshot)

---

### Coverage

#### Definition

Measure of how completely warehouse data covers expected marketplace activity for sync sources (for example orders, sales, finance, inventory).

#### Context

Production Health coverage views.

#### Not To Be Confused With

- [Days Left](#days-left) — inventory coverage horizon
- [Report Scope](#report-scope)

#### Aliases

- API vs Database Coverage (monitoring label)

#### Related Terms

- [Sync Verification](#sync-verification)
- [Production Health](#production-health)

---

### Last Sync

#### Definition

Timestamp or label of the most recent successful synchronization relevant to the view.

#### Context

Report headers, filters, and monitoring tables.

#### Not To Be Confused With

- [Inventory Snapshot](#inventory-snapshot) date

#### Aliases

- Last successful sync
- Latest Sync (monitoring)

#### Related Terms

- [Sync](#sync)
- [Production Health](#production-health)

---

### Operational Alerts

#### Definition

Monitoring alerts about operational/sync health issues requiring attention.

#### Context

Production Health panels.

#### Not To Be Confused With

- [Executive Recommendations](#executive-recommendations)

#### Aliases

—

#### Related Terms

- [Production Health](#production-health)
- [Sync Verification](#sync-verification)

---

### Account Lifecycle

#### Definition

The staged progression of a Marketplace Account from creation through historical backfill to healthy incremental sync.

#### Context

Warehouse foundation and account onboarding operations.

#### Not To Be Confused With

- [Documentation Lifecycle](#documentation-lifecycle)
- [ADR](#adr) lifecycle

#### Aliases

—

#### Related Terms

- [Backfill](#backfill)
- [Incremental Sync](#incremental-sync)
- [Marketplace Account](#marketplace-account)

---

### Import Audit

#### Definition

Auditable record of warehouse import activity used for operational traceability.

#### Context

Historical warehouse import operations.

#### Not To Be Confused With

- [Verification Audit](#verification-audit)

#### Aliases

—

#### Related Terms

- [Backfill](#backfill)
- [Historical Data Warehouse](#historical-data-warehouse)

---

### Decision Engine

#### Definition

Roadmap capability name for deeper automated decision support beyond today’s Executive Rule Engine and Smart Pricing.

#### Context

Product roadmap.

#### Not To Be Confused With

- [Executive Rule Engine](#executive-rule-engine)
- [Smart Pricing](#smart-pricing)

#### Aliases

—

#### Related Terms

- [Forecast](#forecast)
- [Executive Recommendations](#executive-recommendations)

---

### Forecast

#### Definition

Roadmap capability name for forward-looking demand or performance forecasting.

#### Context

Product roadmap.

#### Not To Be Confused With

- [Smart Pricing](#smart-pricing)
- [Days Left](#days-left)

#### Aliases

—

#### Related Terms

- [Decision Engine](#decision-engine)

---

## Documentation and collaboration

### Glossary Document

#### Definition

This document — the canonical vocabulary reference for the project.

#### Context

Business Knowledge Base; mandatory reference for later docs.

#### Not To Be Confused With

- [KPI](#kpi) Catalog — metrics detail
- [Accounting Rules](#accounting-rules) — rule detail

#### Aliases

- Glossary
- Canonical terminology reference

#### Related Terms

- [Knowledge Base](#knowledge-base)
- [Project DNA](#project-dna)

---

### Project DNA

#### Definition

The canonical identity, philosophy, and direction document for the project.

#### Context

First Knowledge Base read before material decisions.

#### Not To Be Confused With

- [Glossary Document](#glossary-document)
- README-style setup docs

#### Aliases

—

#### Related Terms

- [Knowledge Base](#knowledge-base)
- [AI Collaboration](#ai-collaboration)

---

### ADR

#### Definition

Architecture Decision Record — a numbered, lifecycle-managed record of a significant decision and its consequences.

#### Context

Decisions Knowledge Base folder and change governance.

#### Not To Be Confused With

- Ordinary changelog notes
- [Executive Recommendations](#executive-recommendations)

#### Aliases

- Architecture Decision Record

#### Related Terms

- [Traceable Decisions](#traceable-decisions)
- [Knowledge Base](#knowledge-base)

---

## Documentation Lifecycle

#### Definition

Statuses for Knowledge Base documents: Draft, Review, Approved, Production, Deprecated, Archived.

#### Context

Documentation standards and document headers.

#### Not To Be Confused With

- [ADR](#adr) statuses (Proposed, Accepted, Deprecated, Superseded, Rejected)
- [Account Lifecycle](#account-lifecycle)

#### Aliases

—

#### Related Terms

- [Knowledge Base](#knowledge-base)
- [Source of Truth (Documentation)](#source-of-truth-documentation)

---

### Accounting Rules

#### Definition

The Knowledge Base home for settled accounting definitions and rules (companion to this glossary).

#### Context

Business documentation layer.

#### Not To Be Confused With

- [Glossary Document](#glossary-document) — terms only
- [Financial Engine](#financial-engine) — implementation of rules

#### Aliases

—

#### Related Terms

- [Glossary Document](#glossary-document)
- [Commercial Performance](#commercial-performance)

---

### AI Collaboration

#### Definition

How automated assistants participate in the project: understand before coding, respect business rules, maintain consistency, preserve decisions, prefer the Knowledge Base, and declare gaps instead of inventing truth.

#### Context

Project DNA AI Collaboration Philosophy and development standards.

#### Not To Be Confused With

- [Executive Recommendations](#executive-recommendations) — product rules engine for sellers
- Vendor-specific tool names (kept out of canonical vocabulary)

#### Aliases

- AI-readable documentation (related principle)
- Understand before coding (practice)

#### Related Terms

- [Knowledge Base](#knowledge-base)
- [Declare Gaps](#declare-gaps)
- [Different Questions May Require Different Models](#different-questions-may-require-different-models)

---

### Declare Gaps

#### Definition

Practice of stating when required meaning or documentation is missing, instead of inventing product truth.

#### Context

AI collaboration and documentation authorship.

#### Not To Be Confused With

—

#### Aliases

—

#### Related Terms

- [AI Collaboration](#ai-collaboration)
- [Knowledge Base](#knowledge-base)

---

### Multi-Tenant Commercial Reality

#### Definition

Principle that Companies and Marketplace Accounts are first-class boundaries; seller data stays scoped and secrets stay protected.

#### Context

Project DNA and Company & Marketplace Foundation.

#### Not To Be Confused With

- [Marketplace](#marketplace) expansion roadmap

#### Aliases

- Company & Marketplace Foundation (capability name)

#### Related Terms

- [Company](#company)
- [Marketplace Account](#marketplace-account)

---

### Reproducible Calculations

#### Definition

Principle that the same inputs and the same rules must produce the same results across time, surfaces, and exports.

#### Context

Project DNA quality and core principles.

#### Not To Be Confused With

- [Verification](#sync-verification) — checking sync health
- Visual consistency alone

#### Aliases

- Reproducibility

#### Related Terms

- [Financial Engine](#financial-engine)
- [Explainability](#explainability)

---

### Traceable Decisions

#### Definition

Principle that significant product and technical choices are recorded so later work respects intent.

#### Context

Project DNA and ADR practice.

#### Not To Be Confused With

- [Executive Recommendations](#executive-recommendations)

#### Aliases

—

#### Related Terms

- [ADR](#adr)
- [Knowledge Base](#knowledge-base)

---

### Historical Data Is Immutable In Spirit

#### Definition

Principle that past periods are not casually rewritten for present convenience; corrections are deliberate and auditable.

#### Context

Project DNA; inventory and commercial history practices.

#### Not To Be Confused With

- Live operational refresh of current stock caches
- [Inventory Snapshot](#inventory-snapshot) as a mechanism implementing the spirit

#### Aliases

- Historical data is immutable (short)

#### Related Terms

- [Inventory Snapshot](#inventory-snapshot)
- [Historical Data Warehouse](#historical-data-warehouse)

---

### Different Questions May Require Different Models

#### Definition

Principle that modules answering different business questions may use different rules by design. Unifying them for simplicity is forbidden when that would falsify meaning. Estimated Tax is the flagship example.

#### Context

Project DNA; Estimated Tax dual contexts; Smart Pricing vs Commercial Performance.

#### Not To Be Confused With

- Casual inconsistency without documented reason

#### Aliases

—

#### Related Terms

- [Estimated Tax](#estimated-tax)
- [Smart Pricing](#smart-pricing)
- [Commercial Performance](#commercial-performance)

---

### Explainability

#### Definition

Product philosophy that numbers must be explainable: meaning, inclusions, exclusions, and producing rule.

#### Context

Project DNA product philosophy; KPI and report design.

#### Not To Be Confused With

- Marketing copy
- [Auditability](#auditability)

#### Aliases

—

#### Related Terms

- [Auditability](#auditability)
- [Reproducible Calculations](#reproducible-calculations)

---

### Auditability

#### Definition

Product philosophy that important results can be reconstructed from stored facts and published rules.

#### Context

Project DNA; verification and reporting.

#### Not To Be Confused With

- [Verification Audit](#verification-audit) — a specific sync evaluation run
- [Explainability](#explainability)

#### Aliases

—

#### Related Terms

- [Explainability](#explainability)
- [Single Source of Truth (Data)](#single-source-of-truth-data)

---

### Accuracy Over Visual Complexity

#### Definition

Product philosophy that a correct plain number beats an impressive but ambiguous visualization.

#### Context

Project DNA; UI and report design choices.

#### Not To Be Confused With

—

#### Aliases

—

#### Related Terms

- [Explainability](#explainability)
- [KPI](#kpi)

---

---

## Document maintenance

1. Add a term when a concept is used in Production UI or Knowledge Base without a glossary home.
2. Prefer extending **Aliases** over creating near-duplicate terms.
3. When retiring a canonical name, keep it as an alias pointing to the successor and record an ADR if the change is consequential.
4. Do not put formulas, interface field names, or persistence names in definitions.
