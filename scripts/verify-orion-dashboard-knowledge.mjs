/**
 * Dashboard Knowledge validation + retrieval tests.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DASHBOARD_KNOWLEDGE_OBJECTS } from "../src/lib/orion/seed/dashboard-objects.ts";
import { lookupById } from "../src/lib/orion/registry/service.ts";
import { createVerifier } from "./orion-knowledge-verify-utils.mjs";

const { check, runRetrievalTests, finish } = createVerifier("Orion Dashboard Knowledge Validation");

check("Seed module", existsSync(resolve(process.cwd(), "src/lib/orion/seed/dashboard-objects.ts")));

for (const id of DASHBOARD_KNOWLEDGE_OBJECTS.map((o) => o.id)) {
  check(`Object ${id}`, !!lookupById(id), lookupById(id)?.title);
}

console.log("\n--- Retrieval tests (12) ---");
runRetrievalTests(
  [
    { q: "What does the Dashboard Revenue card show?", expectIds: ["DASH-004", "FE-003"] },
    { q: "What does Gross Sales mean?", expectIds: ["FE-001", "DASH-005"] },
    { q: "How is Net Profit calculated?", expectIds: ["FE-013", "DASH-006"] },
    { q: "Which date does the Dashboard use?", expectIds: ["DASH-002", "FE-034", "REP-006"] },
    { q: "What is Marketplace Fee?", expectIds: ["FE-004", "DASH-007"] },
    { q: "What does Settlement show?", expectIds: ["DASH-008", "FE-014", "REP-004"] },
    { q: "What are Units Sold?", expectIds: ["FE-028", "DASH-009"] },
    { q: "What are Returned Units?", expectIds: ["FE-029", "DASH-009"] },
    { q: "What are Net Units?", expectIds: ["FE-029", "DASH-009"] },
    {
      q: "What is the difference between Dashboard Revenue and WB Settlement?",
      expectIds: ["DASH-010", "FE-014", "DASH-004", "DASH-008"],
    },
    { q: "Which data source feeds the Dashboard?", expectIds: ["DASH-011", "DASH-001", "DASH-002"] },
    {
      q: "Why can Dashboard Sales differ from the seller portal?",
      expectIds: ["DASH-012", "FE-035"],
    },
  ],
  "Dashboard"
);

finish();
