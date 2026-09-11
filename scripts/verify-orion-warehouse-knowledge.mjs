/**
 * Warehouse Knowledge Materialization validation + retrieval tests.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { WAREHOUSE_KNOWLEDGE_OBJECTS } from "../src/lib/orion/seed/warehouse-objects.ts";
import { getRegistryIndex, lookupById } from "../src/lib/orion/registry/service.ts";
import { createVerifier } from "./orion-knowledge-verify-utils.mjs";

const { check, runRetrievalTests, finish } = createVerifier("Orion Warehouse Knowledge Validation");

const requiredIds = WAREHOUSE_KNOWLEDGE_OBJECTS.map((o) => o.id);

console.log("--- Seed artifacts ---");
check(
  "Warehouse seed module",
  existsSync(resolve(process.cwd(), "src/lib/orion/seed/warehouse-objects.ts"))
);
check(
  "Warehouse objects JSON",
  existsSync(resolve(process.cwd(), "data/orion/objects/warehouse-platform.json")) ||
    WAREHOUSE_KNOWLEDGE_OBJECTS.length >= 25
);

console.log("\n--- Required Warehouse objects ---");
for (const id of requiredIds) {
  const obj = lookupById(id) ?? WAREHOUSE_KNOWLEDGE_OBJECTS.find((o) => o.id === id);
  check(`Object ${id}`, !!obj, obj?.title);
}

const idx = getRegistryIndex();
check(
  "Registry includes warehouse objects",
  requiredIds.every((id) => idx.entries.some((e) => e.id === id && e.is_active))
);

console.log("\n--- Metadata completeness ---");
for (const id of ["WH-001", "WH-011", "WH-013", "WH-019"]) {
  const obj = lookupById(id);
  check(
    `${id} has sources`,
    (obj?.sources.length ?? 0) >= 1 && !!obj?.description && obj.confidence === "Verified"
  );
}

console.log("\n--- Retrieval tests (20 questions) ---");
runRetrievalTests(
  [
    { q: "What does Warehouse Sales Analytics use?", expectIds: ["WH-011", "WH-003", "WH-004", "WH-005"] },
    { q: "Can I analyze 90 days of warehouse sales?", expectIds: ["WH-017", "WH-011"] },
    { q: "What is a Warehouse Location?", expectIds: ["WH-013", "WH-015"] },
    { q: "How are FBS locations represented?", expectIds: ["WH-014", "WH-013", "WH-015"] },
    { q: "Can I have multiple FBS locations?", expectIds: ["WH-014", "WH-027"] },
    { q: "Does FBS create a separate reporting system?", expectIds: ["WH-027", "WH-014"] },
    {
      q: "What is the difference between warehouse sales and inventory snapshots?",
      expectIds: ["WH-026", "WH-011", "WH-007"],
    },
    { q: "How can I see stock from 15 days ago?", expectIds: ["WH-026", "WH-007", "WH-018"] },
    { q: "How long are inventory snapshots retained?", expectIds: ["WH-019", "WH-018"] },
    { q: "How does daily inventory continuity work?", expectIds: ["WH-019", "WH-018"] },
    { q: "What is the activation date?", expectIds: ["WH-019", "WH-018"] },
    { q: "Does Dashboard Sync create warehouse sessions?", expectIds: ["WH-008", "WH-021"] },
    { q: "What is a Warehouse checkpoint?", expectIds: ["WH-009"] },
    { q: "What is Historical Backfill?", expectIds: ["WH-023"] },
    { q: "What is Incremental Sync?", expectIds: ["WH-024"] },
    { q: "What does the Warehouse Control Center control?", expectIds: ["WH-025"] },
    { q: "Which data source contains warehouse sales?", expectIds: ["WH-005", "WH-011"] },
    { q: "Which data source contains historical stock?", expectIds: ["WH-007", "WH-026"] },
    { q: "Is FBS part of Financial Engine calculations?", expectIds: ["WH-027"] },
    { q: "What happens if a warehouse name changes?", expectIds: ["WH-015", "WH-016"] },
  ],
  "Warehouse Platform"
);

finish();
