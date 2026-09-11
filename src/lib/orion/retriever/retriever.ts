/**
 * Orion Deterministic Retriever — Sprint 12.7.
 * Authority-ranked retrieval; never fabricates knowledge.
 */

import { filterRegistry, getRegistryIndex, lookupById } from "@/lib/orion/registry/service";
import type {
  OrionAskContext,
  OrionAuthorityLevel,
  OrionConfidence,
  OrionKnowledgeObject,
  OrionKnowledgeSummary,
  OrionRetrievalCandidate,
  OrionRetrievalResult,
} from "@/lib/orion/types";

const AUTHORITY_RANK: Record<OrionAuthorityLevel, number> = {
  business_rule: 100,
  architecture_decision: 90,
  financial_engine: 80,
  warehouse: 70,
  administration: 60,
  documentation: 50,
  database_schema: 40,
  implementation: 30,
};

const CONFIDENCE_RANK: Record<OrionConfidence, number> = {
  Verified: 40,
  Derived: 30,
  Implementation: 20,
  Unknown: 0,
};

function toSummary(obj: OrionKnowledgeObject): OrionKnowledgeSummary {
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
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2);
}

function scoreObject(
  obj: OrionKnowledgeObject,
  queryTokens: string[],
  queryRaw: string,
  context?: OrionAskContext
): { score: number; reasons: string[] } {
  let score = AUTHORITY_RANK[obj.authority_level] + CONFIDENCE_RANK[obj.confidence];
  const reasons: string[] = [];
  const queryLower = queryRaw.toLowerCase().trim();

  // Exact phrase match on title or alias wins decisively
  if (obj.title.toLowerCase() === queryLower) {
    score += 500;
    reasons.push("exact:title");
  }
  for (const alias of obj.aliases) {
    if (alias.toLowerCase() === queryLower) {
      score += 500;
      reasons.push(`exact:alias:${alias}`);
    } else if (queryLower.length >= 4 && alias.toLowerCase().includes(queryLower)) {
      score += 300;
      reasons.push(`phrase:alias:${alias}`);
    }
  }
  for (const abbr of obj.abbreviations) {
    if (abbr.toLowerCase() === queryLower) {
      score += 450;
      reasons.push(`exact:abbreviation:${abbr}`);
    }
  }

  const haystacks: Array<{ field: string; text: string; weight: number }> = [
    { field: "id", text: obj.id, weight: 200 },
    { field: "title", text: obj.title, weight: 80 },
    ...obj.aliases.map((a) => ({ field: "alias", text: a, weight: 70 })),
    ...obj.synonyms.map((s) => ({ field: "synonym", text: s, weight: 60 })),
    ...obj.keywords.map((k) => ({ field: "keyword", text: k, weight: 50 })),
    ...obj.tags.map((t) => ({ field: "tag", text: t, weight: 40 })),
    ...obj.abbreviations.map((a) => ({ field: "abbreviation", text: a, weight: 55 })),
    { field: "description", text: obj.description, weight: 20 },
  ];

  if (obj.formula) {
    haystacks.push({ field: "formula", text: obj.formula, weight: 25 });
  }

  for (const token of queryTokens) {
    for (const h of haystacks) {
      const lower = h.text.toLowerCase();
      if (lower === token) {
        score += h.weight;
        reasons.push(`exact:${h.field}:${h.text}`);
      } else if (lower.includes(token)) {
        score += Math.floor(h.weight * 0.5);
        reasons.push(`partial:${h.field}:${h.text}`);
      }
    }
  }

  if (context?.module && obj.module.toLowerCase().includes(context.module.toLowerCase())) {
    score += 15;
    reasons.push(`context:module:${context.module}`);
  }
  if (context?.knowledge_id && obj.id === context.knowledge_id) {
    score += 100;
    reasons.push(`context:knowledge_id:${obj.id}`);
  }

  return { score, reasons: [...new Set(reasons)] };
}

export function retrieveKnowledge(
  query: string,
  context?: OrionAskContext,
  limit = 8
): OrionRetrievalResult {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query: trimmed, confidence: "Unknown", candidates: [], unknown: true, ambiguity: false };
  }

  const exactId = trimmed.match(/^[A-Z]{2,5}-\d{3}$/);
  if (exactId) {
    const obj = lookupById(exactId[0]);
    if (obj) {
      return {
        query: trimmed,
        confidence: obj.confidence,
        candidates: [{ object: toSummary(obj), score: 999, match_reasons: ["exact:id"] }],
        unknown: false,
        ambiguity: false,
      };
    }
  }

  const index = getRegistryIndex();
  const readyObjects = Object.values(index.objects).filter(
    (o) => !o.superseded_by && o.lifecycle === "verified"
  );

  const queryTokens = tokenize(trimmed);
  const candidates: OrionRetrievalCandidate[] = [];

  for (const obj of readyObjects) {
    const { score, reasons } = scoreObject(obj, queryTokens, trimmed, context);
    if (score > AUTHORITY_RANK[obj.authority_level] + CONFIDENCE_RANK[obj.confidence]) {
      candidates.push({ object: toSummary(obj), score, match_reasons: reasons });
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.object.id.localeCompare(b.object.id);
  });

  const top = candidates.slice(0, limit);
  if (top.length === 0) {
    return { query: trimmed, confidence: "Unknown", candidates: [], unknown: true, ambiguity: false };
  }

  const topScore = top[0].score;
  const close = top.filter((c) => topScore - c.score <= 15);
  const ambiguity = close.length > 1 && close[0].object.id !== close[1].object.id;

  const bestConfidence = top[0].object.confidence;
  return {
    query: trimmed,
    confidence: bestConfidence,
    candidates: top,
    unknown: false,
    ambiguity,
  };
}

export function searchByFilter(params: {
  module?: string;
  tag?: string;
  category?: string;
}): OrionKnowledgeSummary[] {
  const entries = filterRegistry({
    module: params.module,
    tag: params.tag,
    category: params.category as never,
  });
  return entries
    .map((e) => lookupById(e.id))
    .filter((o): o is OrionKnowledgeObject => o !== null)
    .map(toSummary);
}
