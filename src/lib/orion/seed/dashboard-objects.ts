/**
 * Dashboard Knowledge Objects — Orion expansion.
 * Sources: docs/01-business/GLOSSARY.md, ACCOUNTING_RULES.md,
 * src/services/persisted-query-service.ts, dashboard components.
 */

import type { OrionKnowledgeObject } from "@/lib/orion/types";

const TS = "2026-08-12T00:00:00.000Z";

function dash(
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
    owner: "Dashboard",
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

export const DASHBOARD_KNOWLEDGE_OBJECTS: OrionKnowledgeObject[] = [
  dash({
    id: "DASH-001",
    title: "Dashboard Commercial Performance",
    aliases: ["Dashboard", "Main Dashboard"],
    description:
      "Primary seller dashboard presenting Commercial Performance KPIs (Revenue, Net Profit, costs, settlement, operational metrics) for a scoped Company/Marketplace Account and inclusive date range. Reads warehouse facts via Financial Engine V4 — does not call live marketplace APIs.",
    module: "Dashboard",
    category: "architecture",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["dashboard", "commercial performance", "main dashboard", "which data source feeds dashboard"],
    tags: ["dashboard", "architecture"],
    synonyms: ["Profit Dashboard"],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md#31-commercial-performance-financial-engine", priority: 1 },
      { kind: "implementation", ref: "src/components/dashboard/dashboard-profit-section.tsx", priority: 5 },
      { kind: "implementation", ref: "src/services/persisted-query-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-018" },
      { type: "depends_on", target_id: "FE-016" },
      { type: "used_by", target_id: "DASH-011" },
    ],
  }),
  dash({
    id: "DASH-002",
    title: "Dashboard Date Range",
    aliases: ["Dashboard reporting period", "Dashboard from to dates", "Which date does the Dashboard use", "Which date does the Dashboard use?"],
    description:
      "Dashboard uses URL query params from/to (YYYY-MM-DD) via resolveScopedDateRange. Default: last 30 calendar days inclusive. Presets: 7, 30, 90, 180 days. Sales KPIs filter wb_sales.sale_date; Finance KPIs filter wb_finance.operation_date; Orders filter wb_orders.order_date — all inclusive [from, to].",
    module: "Dashboard",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "which date does the dashboard use",
      "dashboard date range",
      "reporting period dashboard",
    ],
    tags: ["dashboard", "date-range"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md", priority: 1 },
      { kind: "implementation", ref: "src/lib/utils.ts", priority: 5 },
      { kind: "implementation", ref: "src/services/persisted-query-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "related_to", target_id: "FE-034" },
      { type: "used_by", target_id: "DASH-001" },
    ],
  }),
  dash({
    id: "DASH-003",
    title: "Dashboard Account and Scope Selection",
    aliases: ["Company selection", "Marketplace account filter", "Brand scope"],
    description:
      "Dashboard KPIs are scoped by Company and Marketplace Account (and optional brand/product filters via URL scope params). Multi-tenant isolation: figures always relative to selected marketplace_account_id.",
    module: "Dashboard",
    category: "policy",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: ["account selection", "marketplace selection", "dashboard scope"],
    tags: ["dashboard", "scope"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#marketplace-account", priority: 1 },
      { kind: "implementation", ref: "src/lib/scope-navigation.ts", priority: 5 },
    ],
    relationships: [{ type: "used_by", target_id: "DASH-001" }],
  }),
  dash({
    id: "DASH-004",
    title: "Dashboard Revenue Card",
    aliases: ["Dashboard Revenue KPI", "Revenue card"],
    description:
      "Shows Commercial Performance Revenue = Σ Finance ppvz_for_pay for completed sales in scope (Financial Engine V4). Date axis: wb_finance.operation_date aligned with sales period. Not Gross Sales, Net Sales, or Settlement Amount.",
    module: "Dashboard",
    category: "definition",
    authority_level: "financial_engine",
    confidence: "Verified",
    source_priority: "financial_engine",
    keywords: [
      "what does the dashboard revenue card show",
      "dashboard revenue",
      "revenue card",
    ],
    tags: ["dashboard", "revenue", "kpi"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#revenue", priority: 1 },
      { kind: "implementation", ref: "src/lib/financial-engine.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-003" },
      { type: "depends_on", target_id: "FE-022" },
      { type: "related_to", target_id: "DASH-010" },
    ],
    data_sources: ["wb_finance.ppvz_for_pay", "wb_sales"],
  }),
  dash({
    id: "DASH-005",
    title: "Dashboard Gross Sales Card",
    aliases: ["Gross Sales KPI", "Dashboard Sales", "What does Gross Sales mean", "What does Gross Sales mean?"],
    description:
      "Shows Gross Sales — Σ priceWithDisc on completed sales before return subtraction in display story. Date axis: wb_sales.sale_date. Distinct from Revenue card.",
    module: "Dashboard",
    category: "definition",
    authority_level: "financial_engine",
    confidence: "Verified",
    source_priority: "financial_engine",
    keywords: ["what does gross sales mean", "dashboard gross sales", "gross sales card"],
    tags: ["dashboard", "sales", "kpi"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#gross-sales", priority: 1 },
      { kind: "implementation", ref: "src/lib/financial-engine.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-001" },
      { type: "related_to", target_id: "DASH-004" },
    ],
    data_sources: ["wb_sales.price_with_disc", "wb_sales.sale_date"],
  }),
  dash({
    id: "DASH-006",
    title: "Dashboard Net Profit Card",
    aliases: ["Net Profit KPI", "Dashboard profit"],
    description:
      "Shows Commercial Performance Net Profit = Revenue − costs − Estimated Tax (Model B / FE V4). Primary after-tax profitability KPI. Does not use Settlement Profit unless user switches to Model C view.",
    module: "Dashboard",
    category: "definition",
    authority_level: "financial_engine",
    confidence: "Verified",
    source_priority: "financial_engine",
    keywords: ["how is net profit calculated", "dashboard net profit", "net profit card"],
    tags: ["dashboard", "profit", "kpi"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#net-profit", priority: 1 },
      { kind: "implementation", ref: "src/lib/profit-engine-model-b.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-013" },
      { type: "depends_on", target_id: "FE-016" },
      { type: "related_to", target_id: "DASH-005" },
    ],
    formula: "Net Profit = Revenue − Product Cost − Logistics − Storage − Acceptance − Penalties − Other − Advertising − Estimated Tax",
  }),
  dash({
    id: "DASH-007",
    title: "Dashboard Marketplace Fees Card",
    aliases: ["Marketplace Fee KPI", "Commission card"],
    description:
      "Shows Marketplace Fee = max(0, Sales − Sales API forPay) from wb_sales in period. Informational in Net Profit story (fee reflected before Revenue). Finance breakdown card may show COMMISSION+ACQUIRING+PPVZ components separately.",
    module: "Dashboard",
    category: "definition",
    authority_level: "financial_engine",
    confidence: "Verified",
    source_priority: "financial_engine",
    keywords: ["what is marketplace fee", "dashboard marketplace fee", "marketplace fees card"],
    tags: ["dashboard", "fees", "kpi"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#marketplace-fee", priority: 1 },
      { kind: "implementation", ref: "src/components/dashboard/marketplace-fees-metric-card.tsx", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-004" },
      { type: "related_to", target_id: "FE-036" },
    ],
  }),
  dash({
    id: "DASH-008",
    title: "Dashboard Settlement Card",
    aliases: ["WB Settlement KPI", "Settlement view", "What does Settlement show", "What does Settlement show?"],
    description:
      "Presents WB Settlement / settlement-oriented figures for reconciliation — distinct from Commercial Performance Revenue and Net Profit. Uses settlement framing (Model C / wb-settlement). Not interchangeable with Revenue card.",
    module: "Dashboard",
    category: "definition",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: [
      "what does settlement show",
      "dashboard settlement",
      "wb settlement card",
      "difference dashboard revenue and wb settlement",
    ],
    tags: ["dashboard", "settlement", "kpi"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#wb-settlement", priority: 1 },
      { kind: "implementation", ref: "src/lib/wb-settlement.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-014" },
      { type: "related_to", target_id: "DASH-004" },
      { type: "related_to", target_id: "FE-017" },
    ],
  }),
  dash({
    id: "DASH-009",
    title: "Dashboard Operational KPIs",
    aliases: ["Units Sold card", "Orders card", "Returns metrics", "Buyout chart", "What are Units Sold", "What are Units Sold?"],
    description:
      "Operational metrics: Units Sold, Returned Units, Net Units from wb_sales; Orders/Cancelled/Active from wb_orders (order_date); Buyout/conversion between orders and sales. Purchases chart label = Buyout (Glossary), not Purchases module.",
    module: "Dashboard",
    category: "definition",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: [
      "what are units sold",
      "returned units",
      "net units",
      "dashboard orders",
      "buyout",
    ],
    tags: ["dashboard", "operational", "kpi"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#units-sold", priority: 1 },
      { kind: "implementation", ref: "src/lib/financial-engine.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-028" },
      { type: "depends_on", target_id: "FE-029" },
      { type: "depends_on", target_id: "FE-030" },
      { type: "depends_on", target_id: "FE-031" },
    ],
    data_sources: ["wb_sales", "wb_orders"],
  }),
  dash({
    id: "DASH-010",
    title: "Dashboard Revenue vs Settlement Distinction",
    aliases: ["Revenue not Settlement", "Dashboard P&L vs payout", "What is the difference between Dashboard Revenue and WB Settlement", "What is the difference between Dashboard Revenue and WB Settlement?"],
    description:
      "Dashboard Revenue card = Commercial Performance Σ ppvz_for_pay. Settlement card = payout/settlement framing. Difference is intentional — Revenue answers commercial payable; Settlement answers cash transfer reconciliation.",
    module: "Dashboard",
    category: "comparison",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: [
      "difference between dashboard revenue and wb settlement",
      "revenue vs settlement dashboard",
    ],
    tags: ["dashboard", "comparison"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md#32-wb-settlement-settlement-framing", priority: 1 },
    ],
    relationships: [
      { type: "references", target_id: "DASH-004" },
      { type: "references", target_id: "DASH-008" },
      { type: "references", target_id: "FE-027" },
    ],
  }),
  dash({
    id: "DASH-011",
    title: "Dashboard Data Lineage",
    aliases: ["Dashboard data sources", "KPI lineage", "Which data source feeds the Dashboard", "Which data source feeds the Dashboard?"],
    description:
      "Dashboard reads persisted warehouse tables via persisted-query-service: wb_sales (sale_date) for sales/units; wb_finance (operation_date) for Revenue/costs; wb_orders (order_date) for orders; product costs from cost tables. Financial Engine V4 computes KPIs — Dashboard does not invent formulas.",
    module: "Dashboard",
    category: "data",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "which data source feeds the dashboard",
      "dashboard data lineage",
      "dashboard wb_sales wb_finance",
    ],
    tags: ["dashboard", "lineage"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "implementation", ref: "src/services/persisted-query-service.ts", priority: 5 },
      { kind: "documentation", ref: "docs/02-architecture/REPORTING_ARCHITECTURE.md", priority: 3 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-018" },
      { type: "related_to", target_id: "FE-034" },
    ],
    data_sources: ["wb_sales", "wb_finance", "wb_orders"],
  }),
  dash({
    id: "DASH-012",
    title: "Dashboard vs Seller Portal Differences",
    aliases: ["Why dashboard differs from WB portal", "Seller portal reconciliation"],
    description:
      "Dashboard figures can differ from Wildberries seller portal due to: date axis (sale_date vs settlement), API source (Sales vs Finance), return handling, sync lag, and scope filters. Use FE-035 reconciliation knowledge — not a Dashboard bug by default.",
    module: "Dashboard",
    category: "faq",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: [
      "why can dashboard sales differ from seller portal",
      "dashboard vs wildberries",
      "seller portal difference",
    ],
    tags: ["dashboard", "faq"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md#42-conceptual-boundaries", priority: 1 },
      { kind: "implementation", ref: "src/lib/financial-engine.ts", priority: 5 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-035" },
      { type: "related_to", target_id: "DASH-011" },
    ],
  }),
];
