/**
 * Administration Knowledge Objects — Orion expansion.
 */

import type { OrionKnowledgeObject } from "@/lib/orion/types";

const TS = "2026-08-12T00:00:00.000Z";

function adm(
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
    owner: "Administration",
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

export const ADMINISTRATION_KNOWLEDGE_OBJECTS: OrionKnowledgeObject[] = [
  adm({
    id: "ADM-001",
    title: "Administration Purpose",
    aliases: ["Administration module", "Platform administration"],
    description:
      "Operational control plane for Companies, Marketplace Connections, users/roles, security, audit, and platform settings. Governs tenancy and access — does NOT own Financial Engine calculations, Reporting math, Smart Pricing, or Warehouse sync engines.",
    module: "Administration",
    category: "architecture",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["what does administration control", "administration purpose"],
    tags: ["administration", "architecture"],
    synonyms: [],
    abbreviations: ["ADM"],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "business_rule", ref: "docs/01-business/GLOSSARY.md#company", priority: 1 },
    ],
    relationships: [
      { type: "related_to", target_id: "ADM-008" },
      { type: "related_to", target_id: "FE-018", note: "Does not own FE" },
    ],
  }),
  adm({
    id: "ADM-002",
    title: "Administration Shell",
    aliases: ["Admin shell", "Admin navigation"],
    description:
      "Administration UI shell at /administration with navigation to Companies, Connections, Users, Roles, Security, Audit, Warehouse ops, Platform Settings, System Health. Presentation layer only.",
    module: "Administration",
    category: "definition",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["administration shell", "admin navigation"],
    tags: ["administration", "ui"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/app/administration/page.tsx", priority: 5 },
    ],
    relationships: [{ type: "used_by", target_id: "ADM-001" }],
  }),
  adm({
    id: "ADM-003",
    title: "Company Workspace",
    aliases: ["Companies", "Company management", "What does Company Workspace own", "What does Company Workspace own?"],
    description:
      "Administration Companies area owns Company records, currency, tax rate inputs (stewarded business settings), and company-scoped configuration. Distinct from Platform Settings (global presentation).",
    module: "Administration",
    category: "definition",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["what does company workspace own", "companies administration", "does administration own tax settings"],
    tags: ["administration", "companies"],
    synonyms: ["Companies admin"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/app/administration/companies/page.tsx", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "ADM-001" },
      { type: "related_to", target_id: "ADM-007", note: "Tax rate stewarded at company level" },
    ],
  }),
  adm({
    id: "ADM-004",
    title: "Marketplace Connections",
    aliases: ["Connections", "Marketplace credentials", "API keys", "Does Administration own marketplace credentials", "Does Administration own marketplace credentials?"],
    description:
      "Administration Connections owns marketplace account credentials and connection settings enabling Sync. Credentials stored server-side — never exposed to client. Administration owns credential stewardship; sync engines consume credentials.",
    module: "Administration",
    category: "definition",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: [
      "where are marketplace credentials managed",
      "does administration own marketplace credentials",
      "connections",
    ],
    tags: ["administration", "connections", "security"],
    synonyms: ["Marketplace accounts admin"],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/app/administration/connections/page.tsx", priority: 5 },
      { kind: "implementation", ref: "src/lib/platform-config/provider.ts", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "ADM-001" },
      { type: "related_to", target_id: "ADM-010", note: "Secrets not in knowledge objects" },
    ],
  }),
  adm({
    id: "ADM-005",
    title: "Users and Roles",
    aliases: ["User management", "RBAC", "Roles administration"],
    description:
      "Administration Users and Roles manage identities, memberships, marketplace access grants, and role-based permissions. Authorization decisions use RLS + server-side checks.",
    module: "Administration",
    category: "definition",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["users roles administration", "rbac"],
    tags: ["administration", "users", "roles"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/app/administration/users/page.tsx", priority: 5 },
      { kind: "implementation", ref: "src/app/administration/roles/page.tsx", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "ADM-001" },
      { type: "related_to", target_id: "ADM-009" },
    ],
  }),
  adm({
    id: "ADM-006",
    title: "Security and Audit",
    aliases: ["Audit logs", "Security events", "Audit reason"],
    description:
      "Security administration: authentication integration, authorization policies, audit logs with audit reason and correlation ID, security event visibility. Does not expose credentials, ciphertext, tokens, or encryption keys in UI or knowledge.",
    module: "Administration",
    category: "policy",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: [
      "where are security events generated",
      "audit logs",
      "authentication vs authorization",
      "security administration",
    ],
    tags: ["administration", "security", "audit"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/app/administration/security/page.tsx", priority: 5 },
      { kind: "implementation", ref: "src/app/administration/audit-logs/page.tsx", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "ADM-001" },
      { type: "related_to", target_id: "ADM-009" },
      { type: "related_to", target_id: "ADM-010" },
    ],
  }),
  adm({
    id: "ADM-007",
    title: "Platform Settings",
    aliases: ["Platform configuration", "System preferences", "Where are platform settings stored", "Where are platform settings stored?"],
    description:
      "Platform-wide settings via platform-config provider: platform name, default language/timezone, date/number formats, localization, theme, notifications, feature flags, data retention knobs. Stored through administration-platform-settings-service — single SoT for platform prefs.",
    module: "Administration",
    category: "definition",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: [
      "where are platform settings stored",
      "what does platform settings control",
      "default currency configured",
    ],
    tags: ["administration", "settings"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/platform-config/provider.ts", priority: 5 },
      { kind: "implementation", ref: "src/app/administration/settings/page.tsx", priority: 5 },
    ],
    relationships: [
      { type: "used_by", target_id: "ADM-001" },
      { type: "related_to", target_id: "ADM-011" },
      { type: "related_to", target_id: "ADM-012" },
    ],
    exceptions: ["Company currency/tax → Company Workspace, not platform settings"],
  }),
  adm({
    id: "ADM-008",
    title: "Administration Ownership Boundaries",
    aliases: ["What Administration does not own", "Does Administration calculate Net Profit", "Does Administration calculate Net Profit?", "Does Administration control Warehouse sync engines"],
    description:
      "Administration OWNS: companies, connections/credentials, users, roles, security, audit, platform settings, warehouse operational UI. Does NOT OWN: Financial Engine, Reporting calculations, Smart Pricing, Product Analytics math, warehouse sync engines, or Net Profit computation.",
    module: "Administration",
    category: "policy",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: [
      "does administration calculate net profit",
      "does administration control warehouse sync engines",
      "administration boundaries",
    ],
    tags: ["administration", "boundaries"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/platform-config/provider.ts", priority: 5 },
    ],
    relationships: [
      { type: "references", target_id: "FE-013", note: "ADM does not calculate" },
      { type: "references", target_id: "ADM-001" },
    ],
  }),
  adm({
    id: "ADM-009",
    title: "Authentication vs Authorization",
    aliases: ["AuthN vs AuthZ", "Login vs permissions", "What is the difference between Authentication and Authorization", "What is the difference between Authentication and Authorization?"],
    description:
      "Authentication: verify user identity (login/session). Authorization: enforce permissions via roles, RLS, and server-side requireAuth checks. Administration configures both; business modules enforce authorization on every API route.",
    module: "Administration",
    category: "definition",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: [
      "difference between authentication and authorization",
      "authentication authorization",
    ],
    tags: ["administration", "security"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-modules/AUTHENTICATION.md", priority: 3 },
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
    ],
    relationships: [{ type: "used_by", target_id: "ADM-006" }],
  }),
  adm({
    id: "ADM-010",
    title: "Administration Secret Handling",
    aliases: ["Credentials security", "No secrets in client"],
    description:
      "Marketplace API keys and secrets are server-side only (encrypted storage). Orion knowledge and Administration UI must never expose credentials, ciphertext, tokens, or encryption keys.",
    module: "Administration",
    category: "policy",
    authority_level: "documentation",
    confidence: "Verified",
    source_priority: "documentation",
    keywords: ["secret handling", "credentials security"],
    tags: ["administration", "security"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "documentation", ref: "docs/02-architecture/SECURITY.md", priority: 3 },
    ],
    relationships: [
      { type: "used_by", target_id: "ADM-004" },
      { type: "used_by", target_id: "ADM-006" },
    ],
  }),
  adm({
    id: "ADM-011",
    title: "Feature Flags",
    aliases: ["Platform feature flags", "What are Feature Flags", "What are Feature Flags?"],
    description:
      "Feature flags stored in platform settings document, read via platform-config isFeatureEnabled(). Administration Settings UI toggles flags — business modules query provider, not UI.",
    module: "Administration",
    category: "definition",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["what are feature flags", "feature flags"],
    tags: ["administration", "settings"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/platform-config/provider.ts", priority: 5 },
      { kind: "implementation", ref: "src/app/administration/settings/page.tsx", priority: 5 },
    ],
    relationships: [{ type: "depends_on", target_id: "ADM-007" }],
  }),
  adm({
    id: "ADM-012",
    title: "Data Retention Settings",
    aliases: ["Data retention", "warehouseHistoryDays"],
    description:
      "Platform data retention preferences (e.g. warehouseHistoryDays for inventory snapshot retention default 90 days) configured in Platform Settings, consumed via getDataRetentionPreferences(). Administration sets policy; warehouse services enforce.",
    module: "Administration",
    category: "definition",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["what is data retention", "data retention settings"],
    tags: ["administration", "settings", "retention"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "implementation", ref: "src/lib/platform-config/provider.ts", priority: 5 },
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
    ],
    relationships: [
      { type: "depends_on", target_id: "ADM-007" },
      { type: "related_to", target_id: "WH-019", note: "Retention consumed by warehouse continuity" },
    ],
  }),
  adm({
    id: "ADM-013",
    title: "Theme and Localization",
    aliases: ["ThemeProvider", "Default language", "Localization settings", "What is the ThemeProvider", "What is the ThemeProvider?"],
    description:
      "Presentation preferences: theme (light/dark), default language, timezone, date/number formats via platform localization settings. ThemeProvider applies theme client-side from platform config.",
    module: "Administration",
    category: "definition",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["what is the themeprovider", "localization", "default language"],
    tags: ["administration", "localization", "theme"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/lib/platform-config/provider.ts", priority: 5 },
      { kind: "implementation", ref: "src/components/theme-provider.tsx", priority: 5 },
    ],
    relationships: [{ type: "depends_on", target_id: "ADM-007" }],
  }),
  adm({
    id: "ADM-014",
    title: "Warehouse Administration UI",
    aliases: ["Warehouse ops admin", "Warehouse Control Center admin"],
    description:
      "Administration warehouse routes provide operational visibility (health, sessions, queue, checkpoints, scheduler) — read-only over warehouse operations. Does NOT own or execute sync engines.",
    module: "Administration",
    category: "definition",
    authority_level: "implementation",
    confidence: "Verified",
    source_priority: "implementation",
    keywords: ["warehouse administration", "warehouse ops admin"],
    tags: ["administration", "warehouse"],
    synonyms: [],
    abbreviations: [],
    sources: [
      { kind: "documentation", ref: "docs/03-product/ADMINISTRATION_SPECIFICATION.md", priority: 3 },
      { kind: "implementation", ref: "src/app/administration/warehouse/page.tsx", priority: 5 },
      { kind: "implementation", ref: "src/services/warehouse-control-center-service.ts", priority: 5 },
    ],
    relationships: [
      { type: "related_to", target_id: "WH-025", note: "Operational UI only" },
      { type: "related_to", target_id: "ADM-008" },
    ],
  }),
];
