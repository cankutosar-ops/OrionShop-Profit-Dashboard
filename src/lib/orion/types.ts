/**
 * Orion Knowledge Platform — shared types (client-safe).
 * Sprint 12.4–12.9 — Knowledge Object is canonical SoT.
 */

export const ORION_CONFIDENCE_LEVELS = [
  "Verified",
  "Derived",
  "Implementation",
  "Unknown",
] as const;
export type OrionConfidence = (typeof ORION_CONFIDENCE_LEVELS)[number];

export const ORION_LIFECYCLE_STATES = [
  "draft",
  "verified",
  "deprecated",
  "archived",
  "superseded",
] as const;
export type OrionLifecycle = (typeof ORION_LIFECYCLE_STATES)[number];

export const ORION_REGISTRY_STATUSES = ["Ready", "Failed", "Pending"] as const;
export type OrionRegistryStatus = (typeof ORION_REGISTRY_STATUSES)[number];

export const ORION_RELATIONSHIP_TYPES = [
  "depends_on",
  "used_by",
  "implements",
  "implemented_by",
  "references",
  "extends",
  "related_to",
  "verified_by",
  "defined_by",
  "superseded_by",
] as const;
export type OrionRelationshipType = (typeof ORION_RELATIONSHIP_TYPES)[number];

export const ORION_SOURCE_KINDS = [
  "business_rule",
  "adr",
  "documentation",
  "implementation",
  "verification",
] as const;
export type OrionSourceKind = (typeof ORION_SOURCE_KINDS)[number];

export const ORION_CATEGORIES = [
  "definition",
  "calculation",
  "architecture",
  "data",
  "process",
  "policy",
  "comparison",
  "faq",
] as const;
export type OrionCategory = (typeof ORION_CATEGORIES)[number];

export const ORION_AUTHORITY_LEVELS = [
  "business_rule",
  "architecture_decision",
  "financial_engine",
  "warehouse",
  "administration",
  "documentation",
  "database_schema",
  "implementation",
] as const;
export type OrionAuthorityLevel = (typeof ORION_AUTHORITY_LEVELS)[number];

export type OrionSourceRef = {
  kind: OrionSourceKind;
  ref: string;
  priority: number;
  note?: string;
};

export type OrionRelationshipEdge = {
  type: OrionRelationshipType;
  target_id: string;
  note?: string;
};

export type OrionKnowledgeObject = {
  id: string;
  title: string;
  aliases: string[];
  description: string;
  module: string;
  category: OrionCategory;
  owner: string;
  business_owner: string;
  technical_owner: string;
  authority_level: OrionAuthorityLevel;
  confidence: OrionConfidence;
  verification_status: "unverified" | "verified" | "failed" | "not_applicable";
  source_priority: OrionAuthorityLevel;
  relationships: OrionRelationshipEdge[];
  sources: OrionSourceRef[];
  keywords: string[];
  tags: string[];
  synonyms: string[];
  abbreviations: string[];
  locale: string;
  lifecycle: OrionLifecycle;
  version: string;
  superseded_by?: string;
  supersedes?: string;
  created_at: string;
  updated_at: string;
  /** Optional structured payload */
  formula?: string;
  data_sources?: string[];
  exceptions?: string[];
  examples?: string[];
  /** Tenant scope — global knowledge readable by all authenticated users */
  tenant_scope?: "global" | "company";
};

export type OrionRegistryEntry = {
  id: string;
  version: string;
  status: OrionRegistryStatus;
  title: string;
  module: string;
  category: OrionCategory;
  owner: string;
  confidence: OrionConfidence;
  authority_level: OrionAuthorityLevel;
  locale: string;
  tags: string[];
  registered_at: string;
  materialization_run_id: string;
  is_active: boolean;
  superseded_by?: string;
};

export type OrionRegistryIndex = {
  schema_version: "1.0.0";
  updated_at: string;
  materialization_run_id: string;
  entries: OrionRegistryEntry[];
  objects: Record<string, OrionKnowledgeObject>;
  /** Historical versions keyed by `${id}@${version}` */
  versions: Record<string, OrionKnowledgeObject>;
};

export type OrionMaterializationRun = {
  run_id: string;
  started_at: string;
  finished_at: string;
  status: "success" | "failed" | "partial";
  objects_processed: number;
  objects_registered: number;
  failures: Array<{ id?: string; rule: string; message: string }>;
};

export type OrionRegistryFilter = {
  id?: string;
  module?: string;
  category?: OrionCategory;
  owner?: string;
  confidence?: OrionConfidence;
  tag?: string;
  status?: OrionRegistryStatus;
  locale?: string;
  includeHistorical?: boolean;
  version?: string;
};

/** Public DTO — never exposes non-Ready objects */
export type OrionKnowledgeSummary = {
  id: string;
  title: string;
  description: string;
  module: string;
  category: OrionCategory;
  confidence: OrionConfidence;
  version: string;
  tags: string[];
  aliases: string[];
};

export type OrionKnowledgeDetail = OrionKnowledgeSummary & {
  formula?: string;
  data_sources?: string[];
  exceptions?: string[];
  sources: OrionSourceRef[];
  relationships: OrionRelationshipEdge[];
  authority_level: OrionAuthorityLevel;
};

export type OrionRetrievalCandidate = {
  object: OrionKnowledgeSummary;
  score: number;
  match_reasons: string[];
};

export type OrionRetrievalResult = {
  query: string;
  confidence: OrionConfidence;
  candidates: OrionRetrievalCandidate[];
  unknown: boolean;
  ambiguity: boolean;
};

export type OrionRelationshipTraversal = {
  source_id: string;
  direction: "outbound" | "inbound" | "both";
  depth: number;
  edges: Array<{
    from_id: string;
    to_id: string;
    type: OrionRelationshipType;
    depth: number;
    note?: string;
  }>;
  cycle_detected: boolean;
};

export type OrionCitationAnswer = {
  answer: string;
  why: string;
  sources: Array<{ id: string; title: string; confidence: OrionConfidence }>;
  confidence: OrionConfidence;
  unknown: boolean;
  retrieved_ids: string[];
};

export type OrionAskContext = {
  module?: string;
  route?: string;
  knowledge_id?: string;
};
