/**
 * Sprint 12.6 — Orion Knowledge Relationship Engine validation.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getRegistryIndex } from "../src/lib/orion/registry/service.ts";
import { traverseRelationships } from "../src/lib/orion/relationships/graph.ts";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=== Sprint 12.6 — Orion Knowledge Relationships ===\n");

check("Graph module", existsSync(resolve(process.cwd(), "src/lib/orion/relationships/graph.ts")));

const index = getRegistryIndex();
const allObjects = Object.values(index.objects);

console.log("\n--- Direct traversal ---");
const rev = traverseRelationships({ source_id: "FE-003", direction: "outbound", max_depth: 1 }, allObjects);
check("Revenue outbound edges", rev.edges.length >= 1, `${rev.edges.length} edges`);

console.log("\n--- Multi-hop ---");
const np = traverseRelationships({ source_id: "FE-013", direction: "outbound", max_depth: 2 }, allObjects);
check("Net Profit multi-hop", np.edges.some((e) => e.to_id === "FE-003" || e.to_id === "FE-012"));

console.log("\n--- Deterministic ordering ---");
const r1 = traverseRelationships({ source_id: "FE-018", max_depth: 2 }, allObjects);
const r2 = traverseRelationships({ source_id: "FE-018", max_depth: 2 }, allObjects);
check(
  "Deterministic edges",
  JSON.stringify(r1.edges) === JSON.stringify(r2.edges)
);

console.log("\n--- Depth limit ---");
const deep = traverseRelationships({ source_id: "FE-018", max_depth: 1 }, allObjects);
check("Depth respected", deep.edges.every((e) => e.depth <= 1));

console.log("\n--- Cycle detection ---");
check("Cycle flag present", typeof rev.cycle_detected === "boolean");

console.log(`\n=== Result: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
process.exit(failures === 0 ? 0 : 1);
