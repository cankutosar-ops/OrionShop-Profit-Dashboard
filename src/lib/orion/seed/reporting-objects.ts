/**
 * Reporting Knowledge Objects — Orion expansion.
 */

import type { OrionKnowledgeObject } from "@/lib/orion/types";

const TS = "2026-08-12T00:00:00.000Z";

function rep(
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
    owner: "Reporting",
    business_owner: "Product Owner",
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

export const REPORTING_KNOWLEDGE_OBJECTS: OrionKnowledgeObject[] = [
  rep({
    id: "REP-001",
    title: "Reporting Architecture",
    aliases: ["Reports module", "Reporting layer"],
    description:
      "Reporting composes warehouse facts under Accounting Rules into analytical views and exports. Reports never own data, never invent financial formulas, and must be reproducible for the same Report Scope. Consumes Financial Engine read models — not a second ledger.",
    module: "Reporting",
    category: "architecture",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["reporting architecture", "does reporting calculate financial rules itself", "reporting vs financial engine"],
    tags: ["reporting", "architecture"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/REPORTING_ARCHITECTURE.md", priority: 3 },
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md", priority: 1 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-018" },
      { type: "depends_on", target_id: "BIZ-001" },
      { type: "related_to", target_id: "REP-008" },
    ],
  }),
  rep({
    id: "REP-002",
    title: "Sales Report",
    aliases: ["Sales reporting", "Sales report data", "What data does the Sales Report use", "What data does the Sales Report use?"],
    description:
      "Sales-oriented reports use wb_sales filtered by sale_date in Report Scope. Metrics follow sales presentation (Gross/Net Sales, Units) — not Finance Revenue unless explicitly labeled as financial report.",
    module: "Reporting",
    category: "definition",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: ["what data does the sales report use", "sales report", "which reports use sales data"],
    tags: ["reporting", "sales"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#gross-sales", priority: 1 },
      { kind: "implementation", ref: "src/services/persisted-query-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-002" },
      { type: "related_to", target_id: "REP-006" },
    ],
    data_sources: ["wb_sales"],
  }),
  rep({
    id: "REP-003",
    title: "Financial Report",
    aliases: ["Financial reporting", "P&L report", "Which reports use Finance data", "What data does the Financial Report use", "What data does the Financial Report use?"],
    description:
      "Financial reports present Commercial Performance / Financial Engine results: Revenue (Σ ppvz_for_pay), costs from wb_finance (operation_date), Net Profit. Uses Financial Engine — does not redefine formulas.",
    module: "Reporting",
    category: "definition",
    authority_level: "financial_engine",
    confidence: "Verified",
    source_priority: "financial_engine",
    keywords: [
      "what data does the financial report use",
      "financial report",
      "which reports use finance data",
    ],
    tags: ["reporting", "financial"],
    synonyms: ["Profit and Loss report"],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md#31-commercial-performance-financial-engine", priority: 1 },
      { kind: "implementation", ref: "src/lib/financial-engine.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-018" },
      { type: "depends_on", target_id: "FE-013" },
      { type: "related_to", target_id: "REP-006" },
    ],
    data_sources: ["wb_finance", "wb_sales"],
  }),
  rep({
    id: "REP-004",
    title: "Settlement Report",
    aliases: ["Settlement reporting", "WB Settlement report", "What is the Settlement Report", "What is the Settlement Report?"],
    description:
      "Settlement reports present WB Settlement / payout reconciliation framing (Model C / settlement service). Date axis follows finance/settlement logic — distinct from sale_date sales reports.",
    module: "Reporting",
    category: "definition",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: ["what is the settlement report", "settlement report"],
    tags: ["reporting", "settlement"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#wb-settlement", priority: 1 },
      { kind: "implementation", ref: "src/lib/wb-settlement.ts", priority: 5 },
      { kind: "implementation", ref: "src/app/reports/settlement/page.tsx", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-014" },
      { type: "depends_on", target_id: "FE-017" },
      { type: "related_to", target_id: "REP-003" },
    ],
  }),
  rep({
    id: "REP-005",
    title: "Product Profit Report",
    aliases: ["Product profitability report", "Product profit report"],
    description:
      "Product-level profit reports aggregate Financial Engine metrics per product/SKU for the Report Scope. Reuses commercial categories — product slice of Model B results.",
    module: "Reporting",
    category: "definition",
    authority_level: "financial_engine",
    confidence: "Verified",
    source_priority: "financial_engine",
    keywords: ["product profit report", "product reports"],
    tags: ["reporting", "product"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md#31-commercial-performance-financial-engine", priority: 1 },
      { kind: "implementation", ref: "src/lib/product-profitability-builder.ts", priority: 5 },
      { kind: "implementation", ref: "src/app/reports/product-profit-v2/page.tsx", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-016" },
      { type: "depends_on", target_id: "REP-003" },
    ],
  }),
  rep({
    id: "REP-006",
    title: "Reporting Date Semantics",
    aliases: ["Report date fields", "sale_date vs operation_date in reports", "Why can Sales and Finance reports differ", "What date does each report use", "What date does each report use?"],
    description:
      "Each report declares its date axis: Sales reports → sale_date; Financial/Finance costs → operation_date; Orders reports → order_date; Settlement → settlement/finance dates. No generic 'report date' — document per report.",
    module: "Reporting",
    category: "policy",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: [
      "what date does each report use",
      "reporting date semantics",
      "why can sales and finance reports differ",
    ],
    tags: ["reporting", "dates"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md", priority: 1 },
      { kind: "implementation", ref: "src/services/persisted-query-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-034" },
      { type: "used_by", target_id: "REP-002" },
      { type: "used_by", target_id: "REP-003" },
    ],
  }),
  rep({
    id: "REP-007",
    title: "Reporting Scope and Filters",
    aliases: ["Report scope", "Reporting period selection", "How do I select a reporting period", "How do I select a reporting period?"],
    description:
      "Reports use Report Scope: Company, Marketplace Account, inclusive from/to dates, optional brand/category/product filters via URL params (same scope navigation as Dashboard). Period selection via date range picker presets.",
    module: "Reporting",
    category: "process",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["how do i select a reporting period", "report filters", "report scope"],
    tags: ["reporting", "scope"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/REPORTING_ARCHITECTURE.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/scope-navigation.ts", priority: 5 },
    ],
    relationships: [{ type: "used_by", target_id: "REP-001" }],
  }),
  rep({
    id: "REP-008",
    title: "Reporting vs Financial Engine",
    aliases: ["Reports do not own calculations", "Does Reporting calculate financial rules itself", "Does Reporting calculate financial rules itself?"],
    description:
      "Reporting does NOT calculate financial rules independently. It composes Financial Engine V4 outputs and warehouse facts. If Reporting and Dashboard disagree for same scope, that is a defect — not an alternate formula.",
    module: "Reporting",
    category: "policy",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: ["does reporting calculate financial rules itself", "reporting vs financial engine"],
    tags: ["reporting", "policy"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/REPORTING_ARCHITECTURE.md", priority: 3 },
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md", priority: 1 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-018" },
      { type: "related_to", target_id: "DASH-001" },
    ],
  }),
  rep({
    id: "REP-009",
    title: "Report Export",
    aliases: ["Excel export", "Reporting export"],
    description:
      "Export generates downloadable documents from the same composed report data as on-screen views. Export does not modify business state or recalculate with alternate formulas.",
    module: "Reporting",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["report export", "excel export reports"],
    tags: ["reporting", "export"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/02-architecture/REPORTING_ARCHITECTURE.md", priority: 3 },
      { kind: "implementation", ref: "src/app/api/reports/generate/route.ts", priority: 5 },
    ],
    relationships: [{ type: "used_by", target_id: "REP-001" }],
  }),
  rep({
    id: "REP-010",
    title: "Orders in Reporting",
    aliases: ["Orders report", "Which reports use orders"],
    description:
      "Order-based reporting uses wb_orders filtered by order_date. Operational demand metrics — not Commercial Performance Revenue.",
    module: "Reporting",
    category: "definition",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: ["which reports use orders", "orders report"],
    tags: ["reporting", "orders"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "implementation", ref: "src/services/persisted-query-service.ts", priority: 5 },
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#orders", priority: 1 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-030" },
      { type: "related_to", target_id: "REP-006" },
    ],
    data_sources: ["wb_orders"],
  }),
];
