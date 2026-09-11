/**
 * Orion materialization validation — Sprint 12.3/12.4.
 * Fail-closed: invalid objects never become Ready.
 */

import {
  ORION_AUTHORITY_LEVELS,
  ORION_CATEGORIES,
  ORION_CONFIDENCE_LEVELS,
  ORION_LIFECYCLE_STATES,
  ORION_RELATIONSHIP_TYPES,
  ORION_SOURCE_KINDS,
  type OrionKnowledgeObject,
} from "@/lib/orion/types";

export type ValidationFailure = { rule: string; message: string; id?: string };

const ID_PATTERN = /^[A-Z]{2,5}-\d{3}$/;

const REQUIRED_STRING_FIELDS: Array<keyof OrionKnowledgeObject> = [
  "id",
  "title",
  "description",
  "module",
  "category",
  "owner",
  "business_owner",
  "technical_owner",
  "authority_level",
  "confidence",
  "verification_status",
  "source_priority",
  "lifecycle",
  "version",
  "locale",
  "created_at",
  "updated_at",
];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateKnowledgeObjectStructure(
  obj: unknown
): { ok: true; object: OrionKnowledgeObject } | { ok: false; failures: ValidationFailure[] } {
  const failures: ValidationFailure[] = [];

  if (!obj || typeof obj !== "object") {
    return { ok: false, failures: [{ rule: "VAL-STRUCT", message: "Object must be a record" }] };
  }

  const o = obj as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : undefined;

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(o[field])) {
      failures.push({
        rule: "VAL-META-REQUIRED",
        message: `Missing required field: ${field}`,
        id,
      });
    }
  }

  if (id && !ID_PATTERN.test(id)) {
    failures.push({ rule: "VAL-ID-FORMAT", message: `Invalid Knowledge ID format: ${id}`, id });
  }

  if (o.category && !ORION_CATEGORIES.includes(o.category as never)) {
    failures.push({ rule: "VAL-CATEGORY", message: `Invalid category: ${String(o.category)}`, id });
  }

  if (o.confidence && !ORION_CONFIDENCE_LEVELS.includes(o.confidence as never)) {
    failures.push({
      rule: "VAL-CONFIDENCE-REQUIRED",
      message: `Invalid confidence: ${String(o.confidence)}`,
      id,
    });
  }

  if (o.lifecycle && !ORION_LIFECYCLE_STATES.includes(o.lifecycle as never)) {
    failures.push({ rule: "VAL-LIFECYCLE-VALID", message: `Invalid lifecycle: ${String(o.lifecycle)}`, id });
  }

  if (o.authority_level && !ORION_AUTHORITY_LEVELS.includes(o.authority_level as never)) {
    failures.push({
      rule: "VAL-AUTHORITY-REQUIRED",
      message: `Invalid authority_level: ${String(o.authority_level)}`,
      id,
    });
  }

  if (o.source_priority && !ORION_AUTHORITY_LEVELS.includes(o.source_priority as never)) {
    failures.push({
      rule: "VAL-AUTHORITY-REQUIRED",
      message: `Invalid source_priority: ${String(o.source_priority)}`,
      id,
    });
  }

  for (const arrField of ["aliases", "keywords", "tags", "synonyms", "abbreviations"] as const) {
    if (o[arrField] !== undefined && !isStringArray(o[arrField])) {
      failures.push({ rule: "VAL-ARRAY", message: `${arrField} must be string[]`, id });
    }
  }

  if (!Array.isArray(o.relationships)) {
    failures.push({ rule: "VAL-REL-INTEGRITY", message: "relationships must be an array", id });
  } else {
    for (const edge of o.relationships) {
      if (!edge || typeof edge !== "object") {
        failures.push({ rule: "VAL-REL-INTEGRITY", message: "Invalid relationship edge", id });
        continue;
      }
      const e = edge as Record<string, unknown>;
      if (!ORION_RELATIONSHIP_TYPES.includes(e.type as never)) {
        failures.push({
          rule: "VAL-REL-INTEGRITY",
          message: `Unknown relationship type: ${String(e.type)}`,
          id,
        });
      }
      if (typeof e.target_id !== "string" || !ID_PATTERN.test(e.target_id)) {
        failures.push({
          rule: "VAL-REL-INTEGRITY",
          message: `Invalid relationship target_id: ${String(e.target_id)}`,
          id,
        });
      }
    }
  }

  if (!Array.isArray(o.sources)) {
    failures.push({ rule: "VAL-SOURCES-SHAPE", message: "sources must be an array", id });
  } else {
    for (const src of o.sources) {
      if (!src || typeof src !== "object") {
        failures.push({ rule: "VAL-SOURCES-SHAPE", message: "Invalid source entry", id });
        continue;
      }
      const s = src as Record<string, unknown>;
      if (!ORION_SOURCE_KINDS.includes(s.kind as never)) {
        failures.push({
          rule: "VAL-SOURCES-SHAPE",
          message: `Invalid source kind: ${String(s.kind)}`,
          id,
        });
      }
      if (!isNonEmptyString(s.ref)) {
        failures.push({ rule: "VAL-SOURCES-SHAPE", message: "Source ref required", id });
      }
      if (typeof s.priority !== "number" || !Number.isFinite(s.priority)) {
        failures.push({ rule: "VAL-SOURCES-SHAPE", message: "Source priority must be number", id });
      }
    }
  }

  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, object: o as unknown as OrionKnowledgeObject };
}

export function validateKnowledgeObjectAuthority(
  obj: OrionKnowledgeObject
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const id = obj.id;

  const hasBusinessRule = obj.sources.some((s) => s.kind === "business_rule");
  const hasAdr = obj.sources.some((s) => s.kind === "adr");
  const hasImpl = obj.sources.some((s) => s.kind === "implementation");
  const onlyImpl = obj.sources.length > 0 && obj.sources.every((s) => s.kind === "implementation");

  if (obj.confidence === "Verified" && onlyImpl) {
    failures.push({
      rule: "AUTH-NO-IMPL-VERIFIED",
      message: "Verified confidence requires business_rule or adr source",
      id,
    });
  }

  if (
    obj.category === "calculation" &&
    obj.confidence === "Verified" &&
    !hasBusinessRule &&
    !hasAdr
  ) {
    failures.push({
      rule: "AUTH-CALC-OWNER",
      message: "Calculation objects require business_rule or adr source for Verified confidence",
      id,
    });
  }

  if (hasBusinessRule && hasImpl) {
    const minBusiness = Math.min(...obj.sources.filter((s) => s.kind === "business_rule").map((s) => s.priority));
    const minImpl = Math.min(...obj.sources.filter((s) => s.kind === "implementation").map((s) => s.priority));
    if (minImpl < minBusiness) {
      failures.push({
        rule: "AUTH-HIERARCHY",
        message: "Implementation source priority must not outrank business_rule",
        id,
      });
    }
  }

  if (obj.lifecycle === "superseded" && !obj.superseded_by) {
    failures.push({
      rule: "REL-SUPERSEDE-PAIR",
      message: "superseded lifecycle requires superseded_by",
      id,
    });
  }

  return failures;
}

export function validateRelationshipTargets(
  obj: OrionKnowledgeObject,
  knownIds: Set<string>
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const edge of obj.relationships) {
    if (!knownIds.has(edge.target_id)) {
      failures.push({
        rule: "REL-TARGET-EXISTS",
        message: `Relationship target not found: ${edge.target_id}`,
        id: obj.id,
      });
    }
  }
  if (obj.superseded_by && !knownIds.has(obj.superseded_by)) {
    failures.push({
      rule: "REL-TARGET-EXISTS",
      message: `superseded_by target not found: ${obj.superseded_by}`,
      id: obj.id,
    });
  }
  return failures;
}

export function validateReadyEligibility(obj: OrionKnowledgeObject): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  if (obj.lifecycle !== "verified") {
    failures.push({
      rule: "READY-LIFECYCLE",
      message: `Only verified lifecycle may become Ready (got ${obj.lifecycle})`,
      id: obj.id,
    });
  }
  if (obj.confidence === "Unknown") {
    failures.push({
      rule: "READY-CONFIDENCE",
      message: "Unknown confidence may not become Ready",
      id: obj.id,
    });
  }
  return failures;
}

export function validateKnowledgeObjectBatch(
  objects: OrionKnowledgeObject[]
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const ids = new Set<string>();

  for (const obj of objects) {
    const structural = validateKnowledgeObjectStructure(obj);
    if (!structural.ok) {
      failures.push(...structural.failures);
      continue;
    }
    failures.push(...validateKnowledgeObjectAuthority(obj));
    failures.push(...validateReadyEligibility(obj));
    if (ids.has(obj.id)) {
      failures.push({ rule: "VAL-ID-UNIQUE", message: `Duplicate id in batch: ${obj.id}`, id: obj.id });
    }
    ids.add(obj.id);
  }

  const knownIds = new Set(objects.map((o) => o.id));
  for (const obj of objects) {
    failures.push(...validateRelationshipTargets(obj, knownIds));
  }

  return failures;
}
