/**
 * Smart Pricing Knowledge Objects — Orion expansion.
 */

import type { OrionKnowledgeObject } from "@/lib/orion/types";

const TS = "2026-08-12T00:00:00.000Z";

function sp(
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
    owner: "Smart Pricing",
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

export const SMART_PRICING_KNOWLEDGE_OBJECTS: OrionKnowledgeObject[] = [
  sp({
    id: "SP-001",
    title: "Smart Pricing Purpose",
    aliases: ["Smart Pricing", "Profit Simulator", "Decision Simulator"],
    description:
      "Forward-looking pricing decision support: simulates unit economics and solves sale price for target margin. Separate financial model from Commercial Performance (Accounting Rules §3.3). Does NOT modify Financial Engine, Dashboard, Purchases, or Cost Management.",
    module: "Smart Pricing",
    category: "architecture",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: ["what does smart pricing calculate", "smart pricing purpose"],
    tags: ["smart-pricing", "architecture"],
    synonyms: ["Decision Simulator"],
    abbreviations: ["SP"],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md#33-smart-pricing-simulation", priority: 1 },
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#smart-pricing", priority: 1 },
      { kind: "implementation", ref: "src/lib/smart-pricing.ts", priority: 5 },
    ],
    relationships: [
      { type: "references", target_id: "FE-018", note: "References FE concepts; does not own them" },
      { type: "related_to", target_id: "ARCH-001" },
      { type: "related_to", target_id: "SP-007" },
    ],
  }),
  sp({
    id: "SP-002",
    title: "Adaptive Logistics",
    aliases: ["Historical logistics resolution", "Logistics hierarchy"],
    description:
      "Resolves per-unit logistics from historical data with hierarchy: PRODUCT_HISTORY when completed units ≥ 20, else CATEGORY_HISTORY when category units ≥ 50, else ACCOUNT_HISTORY fallback. Thresholds: SMART_PRICING_MIN_PRODUCT_LOGISTICS_SALES=20, SMART_PRICING_MIN_CATEGORY_LOGISTICS_SALES=50.",
    module: "Smart Pricing",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "what is adaptive logistics",
      "adaptive logistics",
      "when does product history apply logistics",
    ],
    tags: ["smart-pricing", "logistics"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "implementation", ref: "src/lib/smart-pricing-logistics.ts", priority: 5 },
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md#33-smart-pricing-simulation", priority: 1 },
    ],
    relationships: [
      { type: "used_by", target_id: "SP-001" },
      { type: "related_to", target_id: "SP-006" },
      { type: "related_to", target_id: "FE-006", note: "SP uses historical logistics; FE uses period logistics" },
    ],
  }),
  sp({
    id: "SP-003",
    title: "Effective Marketplace Cost",
    aliases: ["Smart Pricing marketplace fees", "Historical marketplace fee percent"],
    description:
      "Smart Pricing Effective Marketplace Cost uses weighted historical Marketplace Fee % from Sales API: fee = max(0, Sales − forPay), percent = fee/Sales. Finance COMMISSION category is NOT used for Smart Pricing marketplace fees. Unit-level path may omit PPVZ Reward/VW (documented in smart-pricing-calc-breakdown).",
    module: "Smart Pricing",
    category: "calculation",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "what is effective marketplace cost",
      "which fees are included in effective marketplace cost",
      "smart pricing marketplace fee",
    ],
    tags: ["smart-pricing", "fees"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "implementation", ref: "src/lib/smart-pricing-marketplace-fees.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/smart-pricing-calc-breakdown.ts", priority: 5 },
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#marketplace-fee", priority: 1 },
    ],
    relationships: [
      { type: "depends_on", target_id: "FE-004", note: "Same Sales−forPay basis" },
      { type: "related_to", target_id: "FE-036", note: "Finance presentation differs from SP historical %" },
      { type: "used_by", target_id: "SP-001" },
    ],
    formula: "Weighted fee% = Σ(Sales − forPay) / Σ(Sales) × 100",
    exceptions: ["Finance COMMISSION rows not used for SP fee rate"],
  }),
  sp({
    id: "SP-004",
    title: "Profit Simulator",
    aliases: ["Pricing simulation", "Decision simulator panel"],
    description:
      "Client-side simulation (/analytics/simulator, Smart Pricing UI) solving price for target profit under stated assumptions. Does not persist changes to product costs, Financial Engine, Dashboard, or warehouse data. Simulated ≠ actual profitability.",
    module: "Smart Pricing",
    category: "definition",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: [
      "what is the profit simulator",
      "does profit simulator change real product costs",
      "profit simulator",
    ],
    tags: ["smart-pricing", "simulator"],
    synonyms: ["Decision Simulator"],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md#33-smart-pricing-simulation", priority: 1 },
      { kind: "implementation", ref: "src/components/analytics/decision-simulator-panel.tsx", priority: 5 },
      { kind: "implementation", ref: "src/lib/smart-pricing.ts", priority: 5 },
    ],
    relationships: [
      { type: "implements", target_id: "SP-001" },
      { type: "related_to", target_id: "SP-007" },
    ],
  }),
  sp({
    id: "SP-005",
    title: "Smart Pricing Date Range",
    aliases: ["Smart Pricing 30-day window", "Historical window", "What is the default date range", "What is the default date range?"],
    description:
      "Smart Pricing historical inputs default to a 30-day lookback window for product/category/account history resolution unless overridden. Uses sale_date scoped sales and matching finance rows for adaptive costs.",
    module: "Smart Pricing",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["what is the default date range", "smart pricing date range", "30 day default"],
    tags: ["smart-pricing", "dates"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md#33-smart-pricing-simulation", priority: 1 },
      { kind: "implementation", ref: "src/services/smart-pricing-service.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/smart-pricing-settings.ts", priority: 5 },
    ],
    relationships: [{ type: "used_by", target_id: "SP-006" }],
  }),
  sp({
    id: "SP-006",
    title: "Historical Cost Resolution Hierarchy",
    aliases: ["PRODUCT_HISTORY", "CATEGORY_HISTORY", "ACCOUNT_HISTORY"],
    description:
      "Unified adaptive resolution for fees, logistics, storage: PRODUCT_HISTORY when product completed units ≥ 20; CATEGORY_HISTORY when category units ≥ 50; ACCOUNT_HISTORY fallback. Insufficient history → fall back to next tier or account/default commission.",
    module: "Smart Pricing",
    category: "process",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "when does product history apply",
      "when does category history apply",
      "when does account history apply",
      "insufficient product history",
      "resolution priority",
    ],
    tags: ["smart-pricing", "resolution"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md#33-smart-pricing-simulation", priority: 1 },
      { kind: "implementation", ref: "src/lib/smart-pricing-historical-costs.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/smart-pricing-logistics.ts", priority: 5 },
      { kind: "implementation", ref: "src/lib/smart-pricing-marketplace-fees.ts", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "SP-002" },
      { type: "used_by", target_id: "SP-003" },
      { type: "used_by", target_id: "SP-005" },
    ],
  }),
  sp({
    id: "SP-007",
    title: "Smart Pricing vs Financial Engine",
    aliases: ["Smart Pricing does not modify FE", "SP separate model"],
    description:
      "Smart Pricing does NOT modify Financial Engine, Dashboard calculations, or historical Commercial Performance. Uses different Estimated Tax base (Sale − Marketplace Fee) per ARCH-001. References FE fee concepts but solves forward prices — not period P&L.",
    module: "Smart Pricing",
    category: "comparison",
    authority_level: "business_rule",
    confidence: "Verified",
    source_priority: "business_rule",
    keywords: [
      "does smart pricing modify financial engine",
      "smart pricing vs financial engine",
      "same marketplace fee definition",
    ],
    tags: ["smart-pricing", "comparison"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "business_rule", ref: "docs/01-business/ACCOUNTING_RULES.md#33-smart-pricing-simulation", priority: 1 },
      { kind: "documentation", ref: ".cursor/rules/estimated-tax-dual-model.mdc", priority: 3 },
    ],
    relationships: [
      { type: "references", target_id: "FE-018" },
      { type: "references", target_id: "ARCH-001" },
      { type: "references", target_id: "FE-004" },
    ],
  }),
  sp({
    id: "SP-008",
    title: "Smart Pricing Estimated Tax",
    aliases: ["Simulator tax base"],
    description:
      "Smart Pricing Estimated Tax = Tax Rate × (Sale Price − Marketplace Fee). Intentionally different from Financial Engine historical tax (Tax% × Σ finishedPrice). Do not unify.",
    module: "Smart Pricing",
    category: "calculation",
    authority_level: "architecture_decision",
    confidence: "Verified",
    source_priority: "architecture_decision",
    keywords: ["smart pricing tax", "simulator estimated tax"],
    tags: ["smart-pricing", "tax"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: ".cursor/rules/estimated-tax-dual-model.mdc", priority: 2 },
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#estimated-tax", priority: 1 },
      { kind: "implementation", ref: "src/lib/smart-pricing.ts", priority: 5 },
    ],
    relationships: [
      { type: "defined_by", target_id: "ARCH-001" },
      { type: "related_to", target_id: "FE-012" },
    ],
    formula: "Estimated Tax = Tax Rate × (Sale Price − Marketplace Fee)",
  }),
];
