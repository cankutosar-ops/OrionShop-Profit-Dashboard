/**
 * Orion deterministic answer builder — no LLM; cites retrieved knowledge only.
 */

import { lookupById } from "@/lib/orion/registry/service";
import { retrieveKnowledge } from "@/lib/orion/retriever/retriever";
import type { OrionAskContext, OrionCitationAnswer, OrionKnowledgeObject } from "@/lib/orion/types";

function buildAnswerFromObject(obj: OrionKnowledgeObject): string {
  const parts = [obj.description];
  if (obj.formula) parts.push(`Formula: ${obj.formula}`);
  if (obj.exceptions?.length) parts.push(`Exceptions: ${obj.exceptions.join("; ")}`);
  return parts.join(" ");
}

function buildWhyFromObject(obj: OrionKnowledgeObject): string {
  const sourceKinds = obj.sources.map((s) => `${s.kind}:${s.ref}`).slice(0, 3);
  const relCount = obj.relationships.length;
  return `Based on ${obj.confidence} knowledge object ${obj.id} (${obj.module}). ${
    sourceKinds.length ? `Authoritative sources include ${sourceKinds.join(", ")}.` : ""
  }${relCount ? ` Linked to ${relCount} related concepts.` : ""}`;
}

export function buildOrionAnswer(query: string, context?: OrionAskContext): OrionCitationAnswer {
  const retrieval = retrieveKnowledge(query, context, 5);

  if (retrieval.unknown || retrieval.candidates.length === 0) {
    return {
      answer:
        "Verified project knowledge was not found for this question. Orion does not answer from general model knowledge when verified sources are unavailable.",
      why: "Deterministic retrieval returned no Ready Knowledge Objects matching the query.",
      sources: [],
      confidence: "Unknown",
      unknown: true,
      retrieved_ids: [],
    };
  }

  const primaryId = retrieval.candidates[0].object.id;
  const primary = lookupById(primaryId);
  if (!primary) {
    return {
      answer: "Verified project knowledge could not be loaded for the top retrieval candidate.",
      why: `Registry lookup failed for ${primaryId}.`,
      sources: [],
      confidence: "Unknown",
      unknown: true,
      retrieved_ids: [],
    };
  }

  if (retrieval.ambiguity) {
    const altIds = retrieval.candidates.slice(0, 3).map((c) => c.object.id);
    const altTitles = retrieval.candidates
      .slice(0, 3)
      .map((c) => `${c.object.id} (${c.object.title})`)
      .join("; ");
    return {
      answer: `Multiple plausible knowledge objects match: ${altTitles}. ${buildAnswerFromObject(primary)}`,
      why: `Retrieval found ${retrieval.candidates.length} candidates; showing primary ${primaryId} with ambiguity noted.`,
      sources: retrieval.candidates.slice(0, 3).map((c) => ({
        id: c.object.id,
        title: c.object.title,
        confidence: c.object.confidence,
      })),
      confidence: primary.confidence,
      unknown: false,
      retrieved_ids: altIds,
    };
  }

  const related = retrieval.candidates.slice(1, 3);
  let answer = buildAnswerFromObject(primary);
  if (related.length > 0) {
    answer += ` Related: ${related.map((r) => r.object.title).join(", ")}.`;
  }

  return {
    answer,
    why: buildWhyFromObject(primary),
    sources: [
      { id: primary.id, title: primary.title, confidence: primary.confidence },
      ...related.map((r) => ({
        id: r.object.id,
        title: r.object.title,
        confidence: r.object.confidence,
      })),
    ],
    confidence: primary.confidence,
    unknown: false,
    retrieved_ids: [primary.id, ...related.map((r) => r.object.id)],
  };
}
