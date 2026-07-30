# Business Model

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
- [Glossary](./GLOSSARY.md)
- [Accounting Rules](./ACCOUNTING_RULES.md)

---

Related Documents

- [KPI Catalog](./KPI_CATALOG.md)
- [Start Here](../09-onboarding/START_HERE.md)
- [Modules](../03-modules/README.md)

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

On material change to business domains, user responsibilities, or platform boundaries

---

Source of Truth

This file

---

Purpose

Describe the real-world business domain that OrionShop represents. Project DNA defines identity and philosophy; the Glossary defines vocabulary; Accounting Rules define how money is interpreted. This document defines the business the software must serve.

---

Scope

Business domain, users, objectives, domains, decisions, and boundaries only. Does not specify technology, formulas, interfaces, or presentation design.

---

## 1. Purpose

This business model exists so every capability in the platform can be judged against one shared picture of the seller’s business.

Wildberries sellers operate a commercial loop: they list and price goods, fulfill through the Marketplace, incur fees and operating costs, manage Inventory, interpret settlement, and decide what to buy, promote, discount, or stop. Fragmented marketplace exports and informal spreadsheets make that loop hard to see as one coherent business.

The platform exists to represent that business faithfully — so the seller can understand Commercial Performance, cost structure, inventory position, and the consequences of pricing and replenishment choices with consistent meaning over time.

The business problem solved is not “more charts.” It is **reliable commercial judgment** under Marketplace complexity.

---

## 2. Primary User

The primary user is the **seller-operator**: the person (or small team) accountable for profitability and day-to-day commercial operations of one or more Companies selling on Wildberries through one or more Marketplace Accounts.

### Responsibilities

- Own commercial outcomes for the scoped Company and Marketplace Account.
- Maintain Unit Cost and related cost inputs so Product Cost remains meaningful.
- Interpret Revenue, costs, Operating Profit, Net Profit, and Estimated Tax under Accounting Rules.
- Watch Inventory (Current Stock, coverage, Stock Health) and act on replenishment.
- Use settlement visibility to reconcile cash expectations with commercial reading.
- Decide pricing adjustments with awareness that Smart Pricing is simulation, not history.
- Demand that numbers for the same Reporting Period mean the same thing tomorrow.

### Goals

- Know whether the business is profitably earning after Marketplace and operating realities.
- See where money and stock leak.
- Act earlier on weak Models, overstock, dead stock, and unsustainable pricing.
- Preserve a trustworthy history for comparison and learning.

### Expectations

- Glossary terms keep stable meaning.
- Commercial Performance and WB Settlement are not silently mixed.
- Incomplete or unverified periods are disclosed, not disguised.
- The platform supports decisions; it does not replace the seller’s accountability.

Secondary readers (analysts, partners, advisors) may consume reports, but the model is optimized for the seller-operator’s responsibilities.

---

## 3. Business Objectives

The platform supports these business outcomes:

### Sustainable profitability

Help the seller see and improve Net Profit and related margins without confusing merchandise sales stories (Gross Sales, Net Sales) with Revenue or settlement cash.

### Financial transparency

Make cost categories (Product Cost, Marketplace Fee, Logistics, Storage, Acceptance, Penalties, Adjustments, Advertising, Acquiring) and Estimated Tax epistemically honest — observed, estimated, or simulated as defined in Accounting Rules.

### Operational visibility

Show Orders, Sales, Returns, Return Rate, and product-level operational readings so the seller can manage the business week to week.

### Inventory efficiency

Support stock position, Inventory History, Warehouse Distribution, Days Left, and Stock Health so capital is not trapped in the wrong places.

### Decision support

Move the seller from raw Marketplace noise to actionable choices on assortment, pricing, replenishment, and spend — without pretending every output is a historical fact.

### Historical analysis

Preserve period and snapshot history so the business can compare, investigate incidents, and learn — consistent with historical integrity.

### Multi-account commercial clarity

Respect Company and Marketplace Account boundaries so truth remains scoped under Multi-Tenant Commercial Reality.

---

## 4. Core Business Domains

### Sales Performance

The domain of marketplace demand and conversion: Orders, Sales, Returns, Units Sold, Returned Units, Gross Sales, Returned Sales, Net Sales, and related rates. It answers how merchandise moved, not solely what the seller was paid.

### Financial Performance

The domain of commercial money interpretation: Revenue, cost categories, Operating Profit, Net Profit, Net Margin, and Estimated Tax under Commercial Performance; plus WB Settlement, Seller Payout, and Settlement Amount under settlement framing. Governed by Accounting Rules; vocabulary by Glossary.

### Inventory Management

The domain of stock as working capital: Current Inventory, Current Stock, Warehouse position, To Customer / From Customer when available, Inventory Snapshot history, Inventory Intelligence, Days Left, recommendations (Produce / Purchase, Stop Purchasing, Overstock), and Inventory Value when available.

### Pricing

The domain of forward price decisions: Sale Price, Target Margin, Markup on Cost, and Smart Pricing simulation. Distinct from historical Financial Performance; different questions may require different models.

### Procurement

The domain of acquiring goods for sale: Purchases (Module), Supplier, Unit Cost maintenance via Cost Management, and the link from unit economics to Product Cost. Distinct from Buyout (marketplace customer purchase) and from FBW Supplies (inbound fulfillment receipts).

### Reporting

The domain of scoped management communication: Report Scope, Business Report, Product Report, Marketplace Intelligence sections (including Brand Intelligence, Product Intelligence, Executive Recommendations), Settlement Reconciliation, Appendix, and Excel Export. Reporting presents business truth; it does not invent a second ledger.

### Operational Monitoring

The domain of trust in the operating picture: whether the business reading is complete enough to act on — Coverage, Sync Verification posture, Last Sync awareness, Production Health, and Operational Alerts. Monitoring protects decision quality; it is not itself Commercial Performance.

### Assortment and identity

Cross-cutting domain of Brand, Category, Product, Model, Supplier Article, SKU, Size, and Barcode — the commercial identity lattice every other domain uses to speak precisely.

---

## 5. Business Decision Framework

The platform supports decisions as a progression, not as a single button.

1. **Scope** — Choose Company, Marketplace Account, and Reporting Period (or live operational scope for inventory).
2. **Observe** — See sales, financial, inventory, and settlement signals with correct Glossary labels.
3. **Qualify** — Ask whether the reading is complete and verified enough; respect Live State vs Historical Snapshot vs settlement timing.
4. **Interpret** — Apply the correct financial model (Commercial Performance, WB Settlement, Smart Pricing, or operational Product Analytics) per Accounting Rules.
5. **Compare** — Relate current period to history, Models to peers, warehouses to distribution, price to Target Margin.
6. **Decide** — Choose actions: reprice, replenish, stop purchasing, cut spend, investigate returns, accept a period as closed truth, or wait for better Coverage.
7. **Record intent** — Material rule or interpretation changes belong in the Knowledge Base and decisions process; day-to-day seller actions remain the seller’s operating record.

The platform improves the quality of steps 2–5 so step 6 is grounded. It does not own the seller’s final commercial risk.

---

## 6. Business Lifecycle

From a business perspective, information matures as follows:

```text
Business event
      ↓
Recorded
      ↓
Verified
      ↓
Reported
      ↓
Analysed
      ↓
Decision
```

### Business event

Something real occurs: an Order, Sale, Return, fee or adjustment recognition, stock movement, inbound supply, price change, or purchase of goods from a Supplier.

### Recorded

The event becomes part of the seller’s durable business history for the Marketplace Account — available for later reading, not only for a fleeting Marketplace screen.

### Verified

The seller (aided by operational monitoring) gains confidence that the record is complete enough for the intended question — or learns that it is not.

### Reported

Scoped Commercial Performance, settlement views, inventory snapshots, and management reports present the period or position in shared language.

### Analysed

The seller compares, drills by Brand, Category, Model, or Warehouse, and separates observed history from estimates and simulations.

### Decision

The seller acts — or deliberately waits — with a clear link between the interpretation and the action.

Skipping verification or mixing models at the reported stage produces decisions that feel fast and age poorly.

---

## 7. Business Boundaries

### Included responsibilities

- Represent Wildberries seller commercial reality for scoped Companies and Marketplace Accounts.
- Provide consistent Sales Performance, Financial Performance, Inventory Management, Pricing support, Procurement cost inputs, Reporting, and Operational Monitoring as described above.
- Preserve historical business readings for analysis.
- Distinguish Commercial Performance, WB Settlement, and Smart Pricing as different business questions.
- Maintain a shared business language (Glossary) and money interpretation (Accounting Rules).

### Excluded responsibilities

- Operating the Marketplace (fulfillment networks, buyer apps, Marketplace policy enforcement).
- Acting as the seller’s statutory accountant, tax advisor, or legal counsel.
- Guaranteeing Marketplace-side correctness beyond what can be recorded and verified.
- Making autonomous commercial commitments on the seller’s behalf.
- Replacing the seller’s own purchase contracts, banking, or corporate governance.
- Unbounded multi-marketplace operations until the business model for those Marketplaces is explicitly extended.

### External systems

Business truth depends on external parties the platform does not control:

- **Wildberries (Marketplace)** — source of trading, fulfillment, fee, settlement, and engagement realities.
- **Seller’s cost and procurement world** — Unit Cost, Suppliers, and purchase practices the seller maintains.
- **Seller’s tax and statutory accounting world** — outside product scope; Estimated Tax remains an operational estimate.
- **Future Marketplaces** (for example as roadmap expansion) — external until brought under the same Company / Marketplace Account discipline.

The platform interprets and organizes; it does not become those external systems.

---

## 8. Sources of Business Truth

Business truth has layers. Confusing them creates false confidence.

### Operational events

What happened in the trading and stock world: Orders, Sales, Returns, stock positions, Warehouse movements, Supplies, engagement signals when present. These are the raw materials of Sales Performance and Inventory Management.

### Accounting events and classifications

How money is classified for commercial and settlement reading: Revenue vs sales presentation, cost categories, Seller Payout and Settlement Amount, Estimated Tax as estimate. Meaning is governed by Accounting Rules; naming by Glossary.

### Analytical interpretation

How the business is read for judgment: margins, Stock Health, Days Left, Executive Recommendations, Smart Pricing simulation outputs, period comparisons. Interpretation must declare its model and epistemic status (observed, estimated, simulated, projected, forecast).

### Authority order for conflict

1. Settled Accounting Rules and Glossary meaning for the claimed model.
2. Recorded and verified operational and accounting facts for the scope.
3. Analytical interpretation derived from those facts.
4. Informal memory, screenshots, or unlabeled exports — not authoritative.

The Historical Data Warehouse concept (architecture) exists to serve this business need for durable recorded truth; this document states the business requirement, not the technical design.

---

## 9. Business Consistency

Identical business events, under the same model, scope, and settled rules, must produce identical business interpretations.

### Expectations

1. **Terminological consistency** — Revenue is always Revenue; Buyout is not Purchases (Module); Days Left is the coverage horizon.
2. **Model consistency** — Commercial Performance answers are stable across Dashboard and Reports for the same Reporting Period and account.
3. **Temporal consistency** — Business Event Date, Settlement Date, Historical Snapshot, and Live State are not silently swapped.
4. **Epistemic consistency** — Estimates and simulations stay labeled; they do not become “facts” by repetition.
5. **Cross-surface consistency** — Management documents and operational views that claim the same model must not diverge in meaning.
6. **Change consistency** — When interpretation must change, Change Management in Accounting Rules and Knowledge Base updates apply; history is not casually rewritten.

Inconsistency is a business defect: it trains the seller to distrust the platform and return to private spreadsheets.

---

## 10. Decision Support Philosophy

### Data

Recorded operational and accounting facts for a scope — the ingredients.

### Information

Data arranged in Glossary terms and Accounting Rules categories for a Reporting Period or live inventory scope — the readable business picture.

### Insight

Comparison, pattern, and qualified judgment: what matters, what is weak, what is estimated, what conflicts between commercial and settlement clocks.

### Decision

A chosen action (or deliberate non-action) owned by the seller-operator.

### How the platform helps

- Raises Data to Information through shared language and financial models.
- Raises Information to Insight through history, domain views, recommendations, and clear model boundaries.
- Stops short of owning Decision — except by improving the quality and honesty of everything before it.

Executive Recommendations and Smart Pricing assist insight and option generation. They do not remove seller responsibility, and they must not be mistaken for historical Commercial Performance.

---

## 11. Future Evolution

The business model may grow without abandoning its core:

- Deeper decision support on the same domains (for example Forecast or a broader Decision Engine) as explicit extensions, not silent redefinitions.
- Richer historical completeness and confidence for longer horizons.
- Clearer assortment and warehouse strategy support still grounded in Inventory Management principles.
- Additional Marketplaces only when Company / Marketplace Account boundaries and Glossary/Accounting extensions remain coherent.
- Stronger separation of “what happened,” “what settlement says,” and “what if we price differently” — without collapsing those questions.

Core principles that must not erode: scoped multi-tenant truth, Glossary discipline, Accounting Rules model boundaries, historical integrity, and decision support over vanity analytics (Project DNA).

---

## 12. Success Criteria

Success is judged by business outcomes, not by feature count.

1. **Reliable decisions** — Seller-operators act with fewer contradictory readings of the same period.
2. **Consistent interpretation** — Identical events yield identical meanings under the same model and rules.
3. **Financial confidence** — Revenue, costs, profits, and Estimated Tax are trusted within their declared model and epistemic status.
4. **Operational efficiency** — Inventory and sales signals reduce waste from blind replenishment and late reaction.
5. **Historical transparency** — Past periods and snapshots remain usable for investigation and learning.
6. **Bounded trust** — Users know what the platform includes, excludes, and leaves to external systems.

If these hold, the business model is healthy. If they fail, new surfaces do not compensate.

---

## How to use this document

1. Read Project DNA for identity, Glossary for terms, Accounting Rules for money meaning.
2. Use this Business Model to judge whether a proposed capability serves a real domain and decision path.
3. Do not implement new business meaning here via technology documents first — extend this model (and companions) deliberately.

This file is the canonical business-domain reference for the Knowledge Base.
