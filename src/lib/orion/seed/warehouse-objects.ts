/**
 * Seed Warehouse Platform Knowledge Objects.
 * Sources: docs/02-architecture/HISTORICAL_DATA_WAREHOUSE.md,
 * docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md,
 * docs/99-legacy/inventory-daily-snapshot-sprint-11-1.md,
 * src/lib/warehouse-sales-analytics.ts, src/lib/warehouse-locations.ts,
 * src/services/warehouse-* , src/lib/historical-warehouse/types.ts
 */

import type { OrionKnowledgeObject } from "@/lib/orion/types";

const TS = "2026-08-12T00:00:00.000Z";

function wh(
  partial: Partial<OrionKnowledgeObject> &
    Pick<
      OrionKnowledgeObject,
      | "id"
      | "title"
      | "description"
      | "module"
      | "category"
      | "authority_level"
      | "confidence"
      | "source_priority"
      | "keywords"
      | "tags"
      | "synonyms"
      | "abbreviations"
      | "sources"
      | "relationships"
    >
): OrionKnowledgeObject {
  return {
    aliases: [],
    owner: "Warehouse Platform",
    business_owner: "Warehouse Platform",
    technical_owner: "Platform Architecture",
    verification_status: "verified",
    locale: "en",
    lifecycle: "verified",
    version: "1.0.0",
    created_at: TS,
    updated_at: TS,
    tenant_scope: "global",
    ...partial,
  };
}

export const WAREHOUSE_KNOWLEDGE_OBJECTS: OrionKnowledgeObject[] = [
  wh({
    id: "WH-001",
    title: "Warehouse Platform Overview",
    aliases: ["Historical Data Warehouse", "HDW", "Warehouse Platform"],
    description:
      "The Warehouse Platform persists marketplace operational facts (orders, sales, finance, stock, daily inventory snapshots) for reporting and analytics. Business modules such as Financial Engine and Dashboard read warehouse tables — they do not call live marketplace APIs for historical reporting. Warehouse owns data ingestion, continuity, checkpoints, sessions, and operational visibility — not commercial KPI formulas.",
    module: "Warehouse Platform",
    category: "architecture",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["warehouse platform", "historical data warehouse", "hdw", "purpose", "overview"],
    tags: ["warehouse", "platform", "architecture"],
    synonyms: ["Historical Data Warehouse Platform"],
    abbreviations: ["WH", "HDW"],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/HISTORICAL_DATA_WAREHOUSE.md", priority: 3 },
      { kind: "documentation", ref: "docs/02-architecture/HISTORICAL_DATA_WAREHOUSE_PLATFORM.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/historical-warehouse/types.ts", priority: 5 },
    ],
    relationships: [
      { type: "related_to", target_id: "FE-018", note: "Business modules consume warehouse facts" },
      { type: "implements", target_id: "WH-003", note: "Data architecture implements platform purpose" },
    ],
  }),

  wh({
    id: "WH-002",
    title: "Warehouse Platform Ownership Boundaries",
    aliases: ["What Warehouse does not own", "Operational vs business reporting"],
    description:
      "Warehouse Platform owns: marketplace fact persistence, sync/backfill orchestration, inventory snapshot continuity, checkpoints, sync sessions, operation history, and the Warehouse Control Center operational UI. Warehouse does NOT own: Financial Engine formulas (Revenue, Net Profit, Estimated Tax), Smart Pricing, Dashboard commercial KPI calculations, or marketplace credential administration. Operational control (sync health, sessions, queue) is separate from business reporting (Commercial Performance, Warehouse Sales Analytics UI).",
    module: "Warehouse Platform",
    category: "policy",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["warehouse ownership", "boundaries", "operational control", "business reporting"],
    tags: ["warehouse", "boundaries", "ownership"],
    synonyms: ["Warehouse scope"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/HISTORICAL_DATA_WAREHOUSE.md", priority: 3 },
      { kind: "implementation", ref: "src/services/warehouse-control-center-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "related_to", target_id: "WH-001" },
      { type: "related_to", target_id: "WH-025" },
      { type: "related_to", target_id: "FE-018", note: "FE owns commercial calculations" },
    ],
  }),

  wh({
    id: "WH-003",
    title: "Warehouse Data Architecture",
    aliases: ["Warehouse tables", "Warehouse datasets"],
    description:
      "Core warehouse datasets: wb_orders (commercial order events), wb_sales (completed sale/return events), wb_stock (current stock observations), historical_inventory_snapshots (daily historical inventory), warehouse_sync_sessions (Sprint 10 sync runs), warehouse_checkpoints (incremental cursors), warehouse_operation_history (audit trail). Commercial transactions: wb_orders, wb_sales, wb_finance. Current stock: wb_stock. Historical inventory: historical_inventory_snapshots. Operational state: sessions, checkpoints, entity sync state.",
    module: "Warehouse Platform",
    category: "data",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["warehouse data", "wb_orders", "wb_sales", "wb_stock", "snapshots", "architecture"],
    tags: ["warehouse", "data", "architecture"],
    synonyms: ["Warehouse schema roles"],
    abbreviations: [],
    data_sources: ["wb_orders", "wb_sales", "wb_stock", "historical_inventory_snapshots", "warehouse_sync_sessions", "warehouse_checkpoints"],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/HISTORICAL_DATA_WAREHOUSE.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/historical-warehouse/types.ts", priority: 5 },
    ],
    relationships: [
      { type: "references", target_id: "WH-004" },
      { type: "references", target_id: "WH-005" },
      { type: "references", target_id: "WH-006" },
      { type: "references", target_id: "WH-007" },
      { type: "references", target_id: "WH-008" },
      { type: "references", target_id: "WH-009" },
    ],
  }),

  wh({
    id: "WH-004",
    title: "wb_orders Dataset Role",
    aliases: ["Orders table", "Warehouse orders source"],
    description:
      "wb_orders stores marketplace order events scoped by marketplace_account_id. Used by Warehouse Sales Analytics for Orders count and Orders Amount (order demand). Filtered by order_date within the selected inclusive date range. Warehouse column groups rows; NULL warehouse aggregates to Unknown Warehouse. Written primarily by legacy Dashboard Sync (WbSyncService.syncOrders); Sprint 10 incremental sync also upserts orders. Not used for inventory snapshots or Financial Engine Revenue.",
    module: "Warehouse Platform",
    category: "data",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["wb_orders", "orders", "order_date", "warehouse orders"],
    tags: ["warehouse", "wb_orders", "data"],
    synonyms: ["Orders warehouse table"],
    abbreviations: [],
    data_sources: ["wb_orders"],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/services/warehouse-sales-analytics-service.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/historical-warehouse/types.ts", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "WH-011", note: "Orders KPI source" },
      { type: "depends_on", target_id: "WH-021", note: "Legacy sync writes orders" },
    ],
  }),

  wh({
    id: "WH-005",
    title: "wb_sales Dataset Role",
    aliases: ["Sales table", "Warehouse sales source", "Completed sales"],
    description:
      "wb_sales stores marketplace sale and return events. Warehouse Sales Analytics uses completed sales only (is_return = false) for Units and Revenue, filtered by sale_date within the inclusive date range. Revenue = Σ(price_with_disc × quantity) — this is Warehouse Sales Analytics revenue, NOT Financial Engine Revenue (ppvz_for_pay). Warehouse column groups rows; NULL → Unknown Warehouse. inventory snapshots are NOT a source for warehouse sales.",
    module: "Warehouse Platform",
    category: "data",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["wb_sales", "sales", "sale_date", "warehouse sales", "completed sales"],
    tags: ["warehouse", "wb_sales", "data"],
    synonyms: ["Sales warehouse table"],
    abbreviations: [],
    data_sources: ["wb_sales"],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/services/warehouse-sales-analytics-service.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/warehouse-sales-analytics.ts", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "WH-011", note: "Units and Revenue source" },
      { type: "related_to", target_id: "WH-012", note: "Revenue basis differs from FE" },
      { type: "related_to", target_id: "FE-003", note: "FE Revenue uses ppvz_for_pay — different basis" },
    ],
  }),

  wh({
    id: "WH-006",
    title: "wb_stock Dataset Role",
    aliases: ["Current stock", "Stock table"],
    description:
      "wb_stock holds current marketplace stock observations (warehouse × SKU grain). Represents point-in-time current inventory, not historical inventory. Used for Current Inventory UI and Warehouse Location discovery. Historical stock at a past date requires historical_inventory_snapshots or Inventory History — not wb_stock alone. Legacy Dashboard Sync writes wb_stock via syncStock when the marketplace API succeeds.",
    module: "Warehouse Platform",
    category: "data",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["wb_stock", "current stock", "current inventory", "stock table"],
    tags: ["warehouse", "wb_stock", "data"],
    synonyms: ["Current stocks table"],
    abbreviations: [],
    data_sources: ["wb_stock"],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/HISTORICAL_DATA_WAREHOUSE.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/historical-warehouse/types.ts", priority: 5 },
      { kind: "implementation", ref: "src/services/warehouse-location-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "WH-016", note: "Location discovery source" },
      { type: "related_to", target_id: "WH-026", note: "Distinct from snapshots" },
      { type: "depends_on", target_id: "WH-021" },
    ],
  }),

  wh({
    id: "WH-007",
    title: "historical_inventory_snapshots Dataset Role",
    aliases: ["Historical stock", "Inventory snapshots table", "Daily snapshots", "Historical inventory source"],
    description:
      "historical_inventory_snapshots stores daily historical inventory at grain: marketplace_account_id + snapshot_date + warehouse + nm_id + size (+ seller_article, barcode). Source for Inventory History and past-date stock questions (e.g. stock 15 days ago). NOT used by Warehouse Sales Analytics. Populated by daily capture (WB Analytics wb-warehouses API) and CSV archive import — not by legacy order/sales sync.",
    module: "Warehouse Platform",
    category: "data",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["historical_inventory_snapshots", "historical stock", "inventory snapshots", "15 days ago", "historical inventory source", "which data source contains historical stock"],
    tags: ["warehouse", "snapshots", "inventory", "data"],
    synonyms: ["Daily inventory snapshots table"],
    abbreviations: [],
    data_sources: ["historical_inventory_snapshots"],
    sources: [
      { kind: "documentation", ref: "docs/99-legacy/inventory-daily-snapshot-sprint-11-1.md", priority: 3 },
      { kind: "implementation", ref: "src/services/inventory-daily-snapshot-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "WH-018", note: "Snapshot storage" },
      { type: "used_by", target_id: "WH-026" },
      { type: "depends_on", target_id: "WH-019" },
    ],
  }),

  wh({
    id: "WH-008",
    title: "Warehouse Sync Sessions",
    aliases: ["Sync session", "warehouse_sync_sessions"],
    description:
      "Warehouse Sync Sessions record Sprint 10 Warehouse Platform sync runs (historical backfill and incremental sync engines). Each session tracks entity, status, timing, and progress. Created by warehouse backfill/incremental engines — NOT by legacy Dashboard Sync (WbSyncService). Visible in Warehouse Control Center → Sessions. Dashboard Sync does not create warehouse sync sessions.",
    module: "Warehouse Platform",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["warehouse sync session", "sync sessions", "warehouse_sync_sessions", "dashboard sync sessions"],
    tags: ["warehouse", "sessions", "sync"],
    synonyms: ["HDW sync session"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/HISTORICAL_DATA_WAREHOUSE_PLATFORM.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/warehouse/sessions/session-service.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/warehouse/backfill/engine.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/warehouse/incremental/engine.ts", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "WH-023" },
      { type: "used_by", target_id: "WH-024" },
      { type: "related_to", target_id: "WH-025" },
      { type: "related_to", target_id: "WH-021", note: "Legacy sync does not create sessions" },
    ],
  }),

  wh({
    id: "WH-009",
    title: "Warehouse Checkpoint",
    aliases: ["Warehouse checkpoints", "Sync checkpoint", "warehouse_checkpoints"],
    description:
      "A Warehouse Checkpoint stores the incremental sync cursor for a marketplace account and entity (last processed window/date). Incremental sync depends on checkpoints to resume without reprocessing full history. Checkpoints are managed by Sprint 10 warehouse engines and visible in Warehouse Control Center. Legacy Dashboard Sync does not use warehouse checkpoints.",
    module: "Warehouse Platform",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["warehouse checkpoint", "checkpoints", "incremental cursor", "what is a checkpoint"],
    tags: ["warehouse", "checkpoints", "sync"],
    synonyms: ["HDW checkpoint"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/SYNC_ENGINE.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/warehouse/checkpoints/types.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "WH-024", note: "Incremental sync requires checkpoints" },
      { type: "related_to", target_id: "WH-023" },
      { type: "related_to", target_id: "WH-025" },
    ],
  }),

  wh({
    id: "WH-010",
    title: "Warehouse Operation History",
    aliases: ["Operation history", "warehouse_operation_history"],
    description:
      "Warehouse operation history records auditable warehouse platform actions (sync triggers, continuity ticks, admin operations). Provides traceability for operational debugging alongside sync sessions and checkpoints. Read by administration and Warehouse Control Center diagnostics — not used for business KPI calculations.",
    module: "Warehouse Platform",
    category: "process",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["warehouse operation history", "audit trail", "operations"],
    tags: ["warehouse", "operations", "audit"],
    synonyms: ["Warehouse ops history"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/HISTORICAL_DATA_WAREHOUSE_PLATFORM.md", priority: 3 },
    ],
    relationships: [{ type: "related_to", target_id: "WH-025" }],
  }),

  wh({
    id: "WH-011",
    title: "Warehouse Sales Analytics",
    aliases: ["Warehouse Sales", "Warehouse sales reporting", "Warehouse Sales Analytics module"],
    description:
      "Warehouse Sales Analytics reports order demand and completed sales performance grouped by warehouse location for a selected date range. Data sources: wb_orders (Orders, Orders Amount by order_date) and wb_sales completed rows (Units, Revenue by sale_date). Does NOT use historical_inventory_snapshots or wb_stock. UI: /inventory/warehouse-sales. NULL warehouse → Unknown Warehouse. Returns excluded from Units/Revenue (is_return = false).",
    module: "Warehouse Platform",
    category: "definition",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: [
      "warehouse sales analytics",
      "what does warehouse sales analytics use",
      "warehouse sales",
      "warehouse reporting",
    ],
    tags: ["warehouse", "analytics", "sales"],
    synonyms: ["Warehouse Sales module"],
    abbreviations: [],
    data_sources: ["wb_orders", "wb_sales"],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/warehouse-sales-analytics.ts", priority: 5 },
      { kind: "implementation", ref: "src/services/warehouse-sales-analytics-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "WH-004" },
      { type: "depends_on", target_id: "WH-005" },
      { type: "depends_on", target_id: "WH-013", note: "Groups by warehouse location name" },
      { type: "depends_on", target_id: "WH-017", note: "Date range scoping" },
      { type: "related_to", target_id: "WH-026" },
    ],
  }),

  wh({
    id: "WH-012",
    title: "Warehouse Sales Analytics Revenue Basis",
    aliases: ["Warehouse revenue vs Financial Engine revenue", "price_with_disc revenue"],
    description:
      "Warehouse Sales Analytics Revenue = Σ(price_with_disc × quantity) on completed wb_sales rows. This is intentionally different from Financial Engine Revenue (Σ ppvz_for_pay on completed sales). Do not conflate Warehouse Sales Analytics revenue with Commercial Performance Revenue. Both are verified; they answer different questions.",
    module: "Warehouse Platform",
    category: "comparison",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["warehouse revenue", "price_with_disc", "revenue basis", "not financial engine revenue"],
    tags: ["warehouse", "revenue", "conflict-documented"],
    synonyms: ["Warehouse commercial sales revenue"],
    abbreviations: [],
    formula: "Revenue = Σ(price_with_disc × quantity) on completed wb_sales",
    exceptions: ["Financial Engine Revenue uses ppvz_for_pay — see FE-003"],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/warehouse-sales-analytics.ts", priority: 5 },
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#revenue", priority: 1, note: "FE Revenue definition differs" },
    ],
    relationships: [
      { type: "related_to", target_id: "WH-005" },
      { type: "related_to", target_id: "FE-003", note: "Documented divergence — not a bug" },
    ],
  }),

  wh({
    id: "WH-013",
    title: "Warehouse Location Model",
    aliases: ["Warehouse Location", "What is a warehouse location", "Shipping location"],
    description:
      "A Warehouse Location is a stable internal reporting/grouping concept for a shipping location (WB FBO warehouse or FBS seller location). Implemented as exact trimmed warehouse name string — aggregation key and filter key. displayName comes from presentation aliases. type (wb | fbs) is metadata only — never drives KPI or accounting branches. Active flag indicates observation in stock/orders/sales.",
    module: "Warehouse Platform",
    category: "definition",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["warehouse location", "what is a warehouse location", "location model", "shipping location"],
    tags: ["warehouse", "location"],
    synonyms: ["Warehouse shipping location"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/warehouse-locations.ts", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "WH-011" },
      { type: "related_to", target_id: "WH-014" },
      { type: "defined_by", target_id: "WH-015" },
    ],
  }),

  wh({
    id: "WH-014",
    title: "FBS Warehouse Locations",
    aliases: ["FBS locations", "FBS Moscow", "FBS Kazan", "Seller warehouse locations"],
    description:
      "FBS is NOT a separate Warehouse module. FBS shipping locations are Warehouse Locations with type metadata fbs (vs wb). Multiple FBS locations are supported when observed in data (e.g. FBS Moscow, FBS Kazan, МП Коломна, МП Электросталь per warehouse-name-aliases). FBS locations participate in the same Warehouse Sales Analytics and location catalog as WB warehouses. Type must not introduce separate business calculation branches.",
    module: "Warehouse Platform",
    category: "definition",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: [
      "fbs",
      "fbs locations",
      "how are fbs locations represented",
      "multiple fbs locations",
      "fbs moscow",
      "fbs kazan",
    ],
    tags: ["warehouse", "fbs", "location"],
    synonyms: ["FBS shipping location", "Seller warehouse"],
    abbreviations: ["FBS"],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/warehouse-locations.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/warehouse-name-aliases.ts", priority: 5 },
    ],
    relationships: [
      { type: "related_to", target_id: "WH-013" },
      { type: "related_to", target_id: "WH-027" },
    ],
  }),

  wh({
    id: "WH-015",
    title: "Warehouse Location Identity",
    aliases: ["Location identity", "Canonical warehouse name", "Warehouse name identity"],
    description:
      "Current implementation: Identity = exact trimmed raw marketplace warehouse name string (observation → identity). Canonical display name = formatWarehouseName() via warehouse-name-aliases (presentation only — does not change grouping key). Aliases map multiple raw strings to one display label but grouping remains exact name match. type = wb|fbs from name regex. External WB warehouse ID enrichment is NOT implemented — no separate location ID table exists. If marketplace renames a warehouse string, it appears as a new location until manually aliased for display.",
    module: "Warehouse Platform",
    category: "architecture",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "warehouse location identity",
      "canonical name",
      "warehouse name changes",
      "what happens if warehouse name changes",
      "aliases",
    ],
    tags: ["warehouse", "location", "identity"],
    synonyms: ["Warehouse identity strategy"],
    abbreviations: [],
    exceptions: ["Separate internal location UUID table is planned/future — not implemented"],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/warehouse-locations.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/warehouse-name-aliases.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/warehouse-sales-analytics.ts", priority: 5 },
    ],
    relationships: [
      { type: "defined_by", target_id: "WH-013", note: "Identity strategy for location model" },
      { type: "related_to", target_id: "WH-016" },
    ],
  }),

  wh({
    id: "WH-016",
    title: "Warehouse Location Discovery",
    aliases: ["Location catalog", "Automatic location discovery", "Unknown locations"],
    description:
      "Warehouse locations are discovered automatically by unioning distinct non-null warehouse values from wb_stock, wb_sales, and wb_orders for the account. buildWarehouseLocations dedupes by exact trimmed name. Unknown/raw marketplace strings appear as locations when first observed — no pre-registration required. Display aliases (warehouse-name-aliases.ts) affect labels only, not discovery or grouping. historical_inventory_snapshots is not a discovery source in current implementation.",
    module: "Warehouse Platform",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["location discovery", "warehouse catalog", "automatic discovery", "unknown warehouse"],
    tags: ["warehouse", "location", "discovery"],
    synonyms: ["Location catalog behavior"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/services/warehouse-location-service.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/warehouse-locations.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "WH-004" },
      { type: "depends_on", target_id: "WH-005" },
      { type: "depends_on", target_id: "WH-006" },
      { type: "used_by", target_id: "WH-011" },
    ],
  }),

  wh({
    id: "WH-017",
    title: "Warehouse Reporting Date Ranges",
    aliases: ["7 day warehouse report", "30 day warehouse report", "90 day warehouse sales", "Date range presets"],
    description:
      "Warehouse Sales Analytics uses URL query params from and to (YYYY-MM-DD) via resolveScopedDateRange. Default when omitted: last 30 calendar days inclusive of today (buildInclusiveDateRange(30)). Shared DateRangePicker presets include 7, 30, 90, and 180 days — selecting 90 days sets an inclusive 90-day window. Orders filter on order_date; completed sales filter on sale_date — both use gte(from) and lte(to). Yes, you can analyze 90 days of warehouse sales when data exists for that range.",
    module: "Warehouse Platform",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "90 days warehouse sales",
      "7 days",
      "30 days",
      "90 days",
      "date range",
      "can i analyze 90 days",
      "inclusive date range",
    ],
    tags: ["warehouse", "date-range", "reporting"],
    synonyms: ["Warehouse analytics date window"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/utils.ts", priority: 5 },
      { kind: "implementation", ref: "src/components/dashboard/date-range-picker.tsx", priority: 5 },
      { kind: "implementation", ref: "src/services/warehouse-sales-analytics-service.ts", priority: 5 },
    ],
    relationships: [{ type: "used_by", target_id: "WH-011" }],
  }),

  wh({
    id: "WH-018",
    title: "Daily Inventory Snapshots",
    aliases: ["Daily inventory snapshot", "Sprint 10.7 snapshots", "Inventory snapshot capture"],
    description:
      "Daily inventory snapshots capture end-of-day stock positions into historical_inventory_snapshots. Grain: account + snapshot_date + warehouse + nm_id + size. Source: WB Analytics wb-warehouses API (not legacy statistics stocks endpoint). Purpose: historical inventory reporting distinct from current wb_stock. Same-day capture is idempotent (refresh replaces today's rows). Activation date marks when continuity tracking begins for an account.",
    module: "Warehouse Platform",
    category: "architecture",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["daily inventory snapshot", "snapshot capture", "inventory snapshot", "activation date"],
    tags: ["warehouse", "snapshots", "inventory"],
    synonyms: ["Daily snapshot architecture"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/99-legacy/inventory-daily-snapshot-sprint-11-1.md", priority: 3 },
      { kind: "implementation", ref: "src/services/inventory-daily-snapshot-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "implements", target_id: "WH-007" },
      { type: "depends_on", target_id: "WH-019" },
    ],
  }),

  wh({
    id: "WH-019",
    title: "Inventory Snapshot Continuity",
    aliases: ["Snapshot continuity", "Daily inventory continuity", "Sprint 10.7 continuity", "Retention 90 days", "Snapshot activation date", "Activation date", "How long are inventory snapshots retained"],
    description:
      "Continuity process per account: (1) resolve activation date, (2) capture today's snapshot live, (3) recover historical gaps from activation→today when CSV archives allow, (4) purge snapshots older than retention. Default retention: 90 days (configurable via platform warehouseHistoryDays). Independent of Dashboard Sync. Activation date = when snapshot continuity began for the account. Gaps remain when no archive exists for missing dates.",
    module: "Warehouse Platform",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "inventory snapshot continuity",
      "how does daily inventory continuity work",
      "activation date",
      "what is the activation date",
      "retention",
      "90 days retention",
      "how long are inventory snapshots retained",
      "how long are snapshots retained",
      "snapshot retention period",
    ],
    tags: ["warehouse", "continuity", "snapshots"],
    synonyms: ["Historical inventory continuity"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/99-legacy/inventory-daily-snapshot-sprint-11-1.md", priority: 3 },
      { kind: "implementation", ref: "src/services/inventory-snapshot-continuity-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "WH-018" },
      { type: "implemented_by", target_id: "WH-020" },
      { type: "related_to", target_id: "WH-021", note: "Not driven by Dashboard Sync" },
    ],
  }),

  wh({
    id: "WH-020",
    title: "Snapshot Continuity Scheduler",
    aliases: ["Inventory snapshot scheduler", "Hourly continuity scheduler"],
    description:
      "Node-only hourly scheduler started from instrumentation.ts via startInventorySnapshotContinuityScheduler(). Interval: 60 minutes; initial delay 15s. Runs runInventorySnapshotContinuityForAllAccounts. Disabled when INVENTORY_SNAPSHOT_SCHEDULER=0. No system cron — process-local timer only. Requires Node runtime (not Edge). Failure: logs error, next tick retries; tickInFlight prevents overlap. CLI/API also available for manual runs. Primary continuity mechanism — Dashboard Sync backup snapshot is supplementary only.",
    module: "Warehouse Platform",
    category: "architecture",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["snapshot scheduler", "hourly scheduler", "continuity scheduler", "instrumentation"],
    tags: ["warehouse", "scheduler", "continuity"],
    synonyms: ["Inventory continuity scheduler"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/99-legacy/inventory-daily-snapshot-sprint-11-1.md", priority: 3 },
      { kind: "implementation", ref: "src/services/inventory-snapshot-continuity-scheduler.ts", priority: 5 },
      { kind: "implementation", ref: "src/instrumentation.ts", priority: 5 },
    ],
    relationships: [
      { type: "implements", target_id: "WH-019" },
      { type: "related_to", target_id: "WH-021", note: "Dashboard Sync is not primary continuity" },
    ],
  }),

  wh({
    id: "WH-021",
    title: "Legacy Dashboard Sync Path",
    aliases: ["Dashboard Sync", "WbSyncService", "Legacy marketplace sync"],
    description:
      "Legacy Dashboard Sync (WbSyncService / run-sprint2-sync-direct) writes wb_orders, wb_sales, wb_finance, and wb_stock from marketplace APIs. It does NOT create Warehouse Sync Sessions or checkpoints. It does NOT write historical_inventory_snapshots (except optional post-sync backup snapshot hook). Remains the active path for day-to-day orders/sales/finance/stock upserts for most accounts. Distinct from Sprint 10 Warehouse Platform engines.",
    module: "Warehouse Platform",
    category: "architecture",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "dashboard sync",
      "legacy sync",
      "does dashboard sync create warehouse sessions",
      "WbSyncService",
    ],
    tags: ["warehouse", "sync", "legacy"],
    synonyms: ["Sprint 2 sync path"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/SYNC_ENGINE.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/wildberries/sync-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "related_to", target_id: "WH-022", note: "Parallel architecture — do not merge" },
      { type: "used_by", target_id: "WH-004" },
      { type: "used_by", target_id: "WH-005" },
    ],
  }),

  wh({
    id: "WH-022",
    title: "Sprint 10 Warehouse Platform Sync",
    aliases: ["Warehouse platform sync", "HDW sync engines"],
    description:
      "Sprint 10 Warehouse Platform provides historical backfill and incremental sync engines with sessions, checkpoints, and queue orchestration. Entity implementation status (verified): inventory — backfill + incremental; finance — backfill via account lifecycle + incremental; orders/sales/stocks — incremental implemented, historical backfill NOT wired (historicalBackfillImplemented: false). Does not replace legacy sync for orders/sales day-to-day writes today.",
    module: "Warehouse Platform",
    category: "architecture",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["sprint 10 warehouse", "warehouse platform sync", "hdw engines"],
    tags: ["warehouse", "sync", "sprint-10"],
    synonyms: ["Warehouse foundation sync"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/HISTORICAL_DATA_WAREHOUSE_PLATFORM.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/historical-warehouse/types.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/warehouse/backfill/engine.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/warehouse/incremental/engine.ts", priority: 5 },
    ],
    relationships: [
      { type: "related_to", target_id: "WH-021" },
      { type: "implements", target_id: "WH-023" },
      { type: "implements", target_id: "WH-024" },
    ],
  }),

  wh({
    id: "WH-023",
    title: "Historical Backfill",
    aliases: ["Warehouse historical backfill", "HDW backfill"],
    description:
      "Historical backfill loads past marketplace data into warehouse tables using windowed fetch + verification. Implemented: inventory (CSV archives + snapshot pipeline), finance (account lifecycle finance_backfill). NOT implemented for orders/sales historical windows in warehouse engines (script-driven FS progress only). Creates Warehouse Sync Sessions and checkpoints. Triggered via APIs/CLI/admin — NOT automatically running on every account unless explicitly started. Related to but distinct from legacy Dashboard Sync date-range scripts.",
    module: "Warehouse Platform",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["historical backfill", "what is historical backfill", "backfill", "warehouse backfill"],
    tags: ["warehouse", "backfill", "sync"],
    synonyms: ["HDW historical backfill"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/HISTORICAL_DATA_WAREHOUSE.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/warehouse/backfill/engine.ts", priority: 5 },
      { kind: "implementation", ref: "src/services/historical-backfill-service.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/historical-warehouse/types.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "WH-008" },
      { type: "depends_on", target_id: "WH-009" },
      { type: "related_to", target_id: "WH-024" },
      { type: "implemented_by", target_id: "WH-022" },
    ],
  }),

  wh({
    id: "WH-024",
    title: "Incremental Sync",
    aliases: ["Warehouse incremental sync", "HDW incremental"],
    description:
      "Incremental sync advances warehouse entities from checkpoint cursors, processing new marketplace windows. Implemented in Sprint 10 engines for registered entities. Requires existing checkpoints. Creates sync sessions. Available via API/CLI/admin queue — availability does not mean continuously scheduled runtime execution for all accounts. Distinct from Historical Backfill (which seeds past gaps). Legacy Dashboard Sync also performs operational incremental upserts but without warehouse sessions/checkpoints.",
    module: "Warehouse Platform",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["incremental sync", "what is incremental sync", "checkpoint sync"],
    tags: ["warehouse", "incremental", "sync"],
    synonyms: ["Warehouse incremental engine"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/SYNC_ENGINE.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/warehouse/incremental/engine.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/historical-warehouse/types.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "WH-009" },
      { type: "depends_on", target_id: "WH-008" },
      { type: "related_to", target_id: "WH-023" },
      { type: "implemented_by", target_id: "WH-022" },
    ],
  }),

  wh({
    id: "WH-025",
    title: "Warehouse Control Center",
    aliases: ["Warehouse admin", "Control Center", "Warehouse operations UI"],
    description:
      "Warehouse Control Center is an operational read-only UI aggregating warehouse health, sync sessions, queue, checkpoints, scheduler status, alerts, and system health. It observes Sprint 10 warehouse operations — it does NOT own or execute the sync engine. Administration routes: /administration/warehouse/*. Implemented by warehouse-control-center-service.ts reading repositories and ops bundles.",
    module: "Warehouse Platform",
    category: "definition",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "warehouse control center",
      "what does warehouse control center control",
      "warehouse admin",
      "sessions queue checkpoints",
    ],
    tags: ["warehouse", "control-center", "administration"],
    synonyms: ["WCC"],
    abbreviations: ["WCC"],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/HISTORICAL_DATA_WAREHOUSE_PLATFORM.md", priority: 3 },
      { kind: "implementation", ref: "src/services/warehouse-control-center-service.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/administration/warehouse-control-types.ts", priority: 5 },
    ],
    relationships: [
      { type: "references", target_id: "WH-008" },
      { type: "references", target_id: "WH-009" },
      { type: "references", target_id: "WH-020" },
      { type: "related_to", target_id: "WH-002" },
    ],
  }),

  wh({
    id: "WH-026",
    title: "Warehouse Sales vs Inventory History",
    aliases: [
      "Difference warehouse sales and inventory snapshots",
      "Warehouse sales vs inventory history vs current stock",
    ],
    description:
      "Four distinct concepts: (1) Warehouse Sales Analytics — wb_orders + wb_sales by date range; commercial demand/buyouts, NOT stock. (2) Inventory History — UI over historical_inventory_snapshots for past dates. (3) Daily Inventory Snapshots — capture pipeline writing historical_inventory_snapshots. (4) Current Stock — wb_stock point-in-time. To see stock 15 days ago use Inventory History (historical_inventory_snapshots), not Warehouse Sales Analytics.",
    module: "Warehouse Platform",
    category: "comparison",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: [
      "difference warehouse sales and inventory snapshots",
      "warehouse sales vs inventory",
      "stock 15 days ago",
      "how can i see stock from 15 days ago",
      "current stock vs historical",
    ],
    tags: ["warehouse", "comparison", "faq"],
    synonyms: ["Sales vs snapshots vs stock"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "documentation", ref: "docs/99-legacy/inventory-history-sprint-10.md", priority: 3 },
    ],
    relationships: [
      { type: "references", target_id: "WH-011" },
      { type: "references", target_id: "WH-007" },
      { type: "references", target_id: "WH-006" },
      { type: "references", target_id: "WH-018" },
    ],
  }),

  wh({
    id: "WH-027",
    title: "FBS Reporting Behavior",
    aliases: ["FBS in warehouse sales", "FBS financial engine", "FBS separate module"],
    description:
      "FBS locations appear in Warehouse Sales Analytics when wb_orders/wb_sales rows carry FBS warehouse names — same reporting model as WB. FBS is NOT a separate warehouse module or reporting system. Multiple FBS locations supported (name-based). FBS type metadata does NOT change Financial Engine calculations — FE has no FBS-specific branches; location type is warehouse metadata only. FBS naming uses marketplace strings plus display aliases (e.g. FBS Moscow, FBS Kazan).",
    module: "Warehouse Platform",
    category: "faq",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "fbs reporting",
      "will fbs appear in warehouse sales analytics",
      "fbs separate module",
      "fbs financial engine",
      "is fbs part of financial engine",
    ],
    tags: ["warehouse", "fbs", "reporting"],
    synonyms: ["FBS analytics behavior"],
    abbreviations: ["FBS"],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/warehouse-locations.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/warehouse-name-aliases.ts", priority: 5 },
    ],
    relationships: [
      { type: "related_to", target_id: "WH-014" },
      { type: "related_to", target_id: "WH-011" },
      { type: "related_to", target_id: "FE-018", note: "No FBS branch in FE" },
    ],
  }),

  wh({
    id: "WH-028",
    title: "Warehouse Data Freshness",
    aliases: ["Sync freshness", "Data availability vs current", "Stale warehouse data"],
    description:
      "Distinguish four freshness dimensions: (1) Data availability — rows exist in table. (2) Sync freshness — latest order_date/sale_date/finance date from legacy or incremental sync. (3) Snapshot freshness — latest snapshot_date captured by continuity scheduler. (4) Historical coverage — backfill completeness vs activation date. Data existing ≠ data current. Operational reporting must check latest dates per entity. Stock sync may fail independently (e.g. marketplace API 404) while orders/sales remain fresh.",
    module: "Warehouse Platform",
    category: "policy",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["warehouse data freshness", "sync freshness", "snapshot freshness", "stale data", "data current"],
    tags: ["warehouse", "freshness", "operations"],
    synonyms: ["Warehouse staleness model"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/HISTORICAL_DATA_WAREHOUSE.md", priority: 3 },
      { kind: "implementation", ref: "src/services/warehouse-control-center-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "related_to", target_id: "WH-019" },
      { type: "related_to", target_id: "WH-021" },
      { type: "related_to", target_id: "WH-025" },
    ],
  }),

  wh({
    id: "WH-029",
    title: "Warehouse Sales Analytics Returns Handling",
    aliases: ["Return handling warehouse sales", "is_return warehouse"],
    description:
      "Warehouse Sales Analytics excludes returns from Units and Revenue: wb_sales rows with is_return = true are filtered out (eq is_return false). Returns remain in wb_sales table for other modules but do not contribute to warehouse sales buyout metrics. Orders stage uses wb_orders regardless of later return status.",
    module: "Warehouse Platform",
    category: "policy",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["returns", "is_return", "completed sales", "warehouse returns"],
    tags: ["warehouse", "returns", "sales"],
    synonyms: ["Return exclusion rule"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/WAREHOUSE_ANALYTICS_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/warehouse-sales-analytics.ts", priority: 5 },
      { kind: "implementation", ref: "src/services/warehouse-sales-analytics-service.ts", priority: 5 },
    ],
    relationships: [{ type: "used_by", target_id: "WH-011" }],
  }),

  wh({
    id: "WH-030",
    title: "Warehouse Entity Domain Registry",
    aliases: ["WAREHOUSE_DOMAINS", "Entity sync state"],
    description:
      "WAREHOUSE_DOMAINS registry (historical-warehouse/types.ts) defines five entities: inventory, orders, sales, finance, stocks — each with tables, backfill strategy, and implementation flags. Stages: pending → historical_backfill_running → verifying → complete → incremental_sync_active → healthy. Authoritative for which historical backfill paths exist vs planned. Orders/sales historicalBackfillImplemented: false; inventory and finance true.",
    module: "Warehouse Platform",
    category: "architecture",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["warehouse domains", "entity registry", "WAREHOUSE_DOMAINS"],
    tags: ["warehouse", "registry", "entities"],
    synonyms: ["HDW entity registry"],
    abbreviations: [],
    sources: [
      { kind: "implementation", ref: "src/lib/historical-warehouse/types.ts", priority: 5 },
      { kind: "documentation", ref: "docs/99-legacy/historical-data-warehouse-foundation-sprint-11.md", priority: 3 },
    ],
    relationships: [
      { type: "references", target_id: "WH-022" },
      { type: "related_to", target_id: "WH-023" },
      { type: "related_to", target_id: "WH-024" },
    ],
  }),
];
