/**
 * Orion Knowledge service — server-side read-only facade (Sprint 12.8).
 */

import { buildOrionAnswer } from "@/lib/orion/assistant/answer-builder";
import { traverseRelationships } from "@/lib/orion/relationships/graph";
import {
  filterRegistry,
  getRegistryIndex,
  lookupById,
} from "@/lib/orion/registry/service";
import { listMaterializationRuns } from "@/lib/orion/registry/storage";
import { retrieveKnowledge, searchByFilter } from "@/lib/orion/retriever/retriever";
import type {
  OrionAskContext,
  OrionCitationAnswer,
  OrionKnowledgeDetail,
  OrionKnowledgeSummary,
  OrionRegistryEntry,
  OrionRetrievalResult,
} from "@/lib/orion/types";

export function toKnowledgeDetail(id: string): OrionKnowledgeDetail | null {
  const obj = lookupById(id);
  if (!obj) return null;
  return {
    id: obj.id,
    title: obj.title,
    description: obj.description,
    module: obj.module,
    category: obj.category,
    confidence: obj.confidence,
    version: obj.version,
    tags: obj.tags,
    aliases: obj.aliases,
    formula: obj.formula,
    data_sources: obj.data_sources,
    exceptions: obj.exceptions,
    sources: obj.sources,
    relationships: obj.relationships,
    authority_level: obj.authority_level,
  };
}

export function searchKnowledge(query: string, context?: OrionAskContext): OrionRetrievalResult {
  return retrieveKnowledge(query, context);
}

export function listReadyKnowledge(): OrionKnowledgeSummary[] {
  return filterRegistry()
    .map((e) => lookupById(e.id))
    .filter((o): o is NonNullable<typeof o> => o !== null)
    .map((obj) => ({
      id: obj.id,
      title: obj.title,
      description: obj.description,
      module: obj.module,
      category: obj.category,
      confidence: obj.confidence,
      version: obj.version,
      tags: obj.tags,
      aliases: obj.aliases,
    }));
}

export function getKnowledgeRelationships(
  id: string,
  options: { direction?: "outbound" | "inbound" | "both"; max_depth?: number } = {}
) {
  const index = getRegistryIndex();
  return traverseRelationships(
    { source_id: id, direction: options.direction, max_depth: options.max_depth },
    Object.values(index.objects)
  );
}

export function getKnowledgeSources(id: string) {
  const obj = lookupById(id);
  if (!obj) return null;
  return { id: obj.id, title: obj.title, sources: obj.sources };
}

export function explainKnowledge(id: string) {
  const obj = lookupById(id);
  if (!obj) return null;
  return {
    id: obj.id,
    title: obj.title,
    description: obj.description,
    formula: obj.formula,
    confidence: obj.confidence,
    authority_level: obj.authority_level,
    relationships: obj.relationships,
    sources: obj.sources,
    exceptions: obj.exceptions,
  };
}

export function askOrion(question: string, context?: OrionAskContext): OrionCitationAnswer {
  return buildOrionAnswer(question, context);
}

export function getOrionDiagnostics() {
  const index = getRegistryIndex();
  return {
    schema_version: index.schema_version,
    updated_at: index.updated_at,
    materialization_run_id: index.materialization_run_id,
    ready_count: index.entries.filter((e) => e.is_active && e.status === "Ready").length,
    total_versions: Object.keys(index.versions).length,
    recent_runs: listMaterializationRuns().slice(0, 5),
  };
}

export function filterKnowledgeRegistry(params: {
  module?: string;
  category?: string;
  tag?: string;
  owner?: string;
  confidence?: string;
}): OrionRegistryEntry[] {
  return filterRegistry({
    module: params.module,
    category: params.category as never,
    tag: params.tag,
    owner: params.owner,
    confidence: params.confidence as never,
  });
}

/** Tenant safety — global knowledge readable by all authenticated users */
export function isKnowledgeAccessible(_userId: string, knowledgeId: string): boolean {
  const obj = lookupById(knowledgeId);
  if (!obj) return false;
  return (obj.tenant_scope ?? "global") === "global";
}

export { searchByFilter };
