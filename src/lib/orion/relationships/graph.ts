/**
 * Orion Knowledge Relationship Engine — Sprint 12.6.
 * Deterministic traversal with cycle detection and depth limits.
 */

import { getRegistryIndex, lookupById } from "@/lib/orion/registry/service";
import type {
  OrionKnowledgeObject,
  OrionRelationshipTraversal,
  OrionRelationshipType,
} from "@/lib/orion/types";

export type RelationshipQuery = {
  source_id: string;
  direction?: "outbound" | "inbound" | "both";
  types?: OrionRelationshipType[];
  max_depth?: number;
};

const REVERSE_TYPES: Partial<Record<OrionRelationshipType, OrionRelationshipType>> = {
  depends_on: "used_by",
  used_by: "depends_on",
  implements: "implemented_by",
  implemented_by: "implements",
  references: "references",
  extends: "extends",
  related_to: "related_to",
  verified_by: "verified_by",
  defined_by: "defined_by",
  superseded_by: "superseded_by",
};

function getOutboundEdges(obj: OrionKnowledgeObject, types?: Set<OrionRelationshipType>) {
  return obj.relationships.filter((e) => !types || types.has(e.type));
}

function getInboundEdges(
  targetId: string,
  allObjects: OrionKnowledgeObject[],
  types?: Set<OrionRelationshipType>
) {
  const edges: Array<{
    from_id: string;
    to_id: string;
    type: OrionRelationshipType;
    note?: string;
  }> = [];
  for (const obj of allObjects) {
    for (const edge of obj.relationships) {
      if (edge.target_id !== targetId) continue;
      const reverse = REVERSE_TYPES[edge.type];
      if (!reverse) continue;
      if (types && !types.has(reverse)) continue;
      edges.push({
        from_id: obj.id,
        to_id: targetId,
        type: reverse,
        note: edge.note,
      });
    }
  }
  return edges;
}

export function traverseRelationships(
  query: RelationshipQuery,
  allObjects: OrionKnowledgeObject[]
): OrionRelationshipTraversal {
  const direction = query.direction ?? "outbound";
  const maxDepth = Math.min(Math.max(query.max_depth ?? 2, 1), 5);
  const typeSet = query.types ? new Set(query.types) : undefined;
  const source = lookupById(query.source_id);
  if (!source) {
    return {
      source_id: query.source_id,
      direction,
      depth: 0,
      edges: [],
      cycle_detected: false,
    };
  }

  const objectMap = new Map(allObjects.map((o) => [o.id, o]));
  const visited = new Set<string>();
  const edges: OrionRelationshipTraversal["edges"] = [];
  let cycleDetected = false;

  type QueueItem = { id: string; depth: number; path: string[] };
  const queue: QueueItem[] = [{ id: query.source_id, depth: 0, path: [query.source_id] }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const obj = objectMap.get(current.id) ?? (current.id === query.source_id ? source : null);
    if (!obj) continue;

    const emitOutbound = direction === "outbound" || direction === "both";
    const emitInbound = direction === "inbound" || direction === "both";

    if (emitOutbound) {
      for (const edge of getOutboundEdges(obj, typeSet)) {
        edges.push({
          from_id: current.id,
          to_id: edge.target_id,
          type: edge.type,
          depth: current.depth + 1,
          note: edge.note,
        });
        const nextPath = [...current.path, edge.target_id];
        if (nextPath.filter((x) => x === edge.target_id).length > 1) {
          cycleDetected = true;
          continue;
        }
        const visitKey = `${edge.target_id}:${current.depth + 1}:out`;
        if (!visited.has(visitKey)) {
          visited.add(visitKey);
          queue.push({ id: edge.target_id, depth: current.depth + 1, path: nextPath });
        }
      }
    }

    if (emitInbound) {
      for (const edge of getInboundEdges(current.id, allObjects, typeSet)) {
        edges.push({
          from_id: edge.from_id,
          to_id: edge.to_id,
          type: edge.type,
          depth: current.depth + 1,
          note: edge.note,
        });
        const nextPath = [...current.path, edge.from_id];
        if (nextPath.filter((x) => x === edge.from_id).length > 1) {
          cycleDetected = true;
          continue;
        }
        const visitKey = `${edge.from_id}:${current.depth + 1}:in`;
        if (!visited.has(visitKey)) {
          visited.add(visitKey);
          queue.push({ id: edge.from_id, depth: current.depth + 1, path: nextPath });
        }
      }
    }
  }

  edges.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.from_id !== b.from_id) return a.from_id.localeCompare(b.from_id);
    if (a.to_id !== b.to_id) return a.to_id.localeCompare(b.to_id);
    return a.type.localeCompare(b.type);
  });

  return {
    source_id: query.source_id,
    direction,
    depth: maxDepth,
    edges,
    cycle_detected: cycleDetected,
  };
}

export function getDirectRelationships(id: string): {
  outbound: OrionKnowledgeObject["relationships"];
  inbound: Array<{ from_id: string; type: OrionRelationshipType; note?: string }>;
} {
  const obj = lookupById(id);
  if (!obj) return { outbound: [], inbound: [] };
  const index = getRegistryIndex();
  const allObjects = Object.values(index.objects);
  const inbound = getInboundEdges(id, allObjects).map((e) => ({
    from_id: e.from_id,
    type: e.type,
    note: e.note,
  }));
  inbound.sort((a, b) => a.from_id.localeCompare(b.from_id));
  return { outbound: obj.relationships, inbound };
}
