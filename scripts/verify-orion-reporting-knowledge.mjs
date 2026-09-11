/**
 * Reporting Knowledge validation + retrieval tests.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { REPORTING_KNOWLEDGE_OBJECTS } from "../src/lib/orion/seed/reporting-objects.ts";
import { lookupById } from "../src/lib/orion/registry/service.ts";
import { createVerifier } from "./orion-knowledge-verify-utils.mjs";

const { check, runRetrievalTests, finish } = createVerifier("Orion Reporting Knowledge Validation");

check("Seed module", existsSync(resolve(process.cwd(), "src/lib/orion/seed/reporting-objects.ts")));

for (const id of REPORTING_KNOWLEDGE_OBJECTS.map((o) => o.id)) {
  check(`Object ${id}`, !!lookupById(id), lookupById(id)?.title);
}

console.log("\n--- Retrieval tests (10) ---");
runRetrievalTests(
  [
    { q: "What data does the Sales Report use?", expectIds: ["REP-002"] },
    { q: "What data does the Financial Report use?", expectIds: ["REP-003"] },
    { q: "What is the Settlement Report?", expectIds: ["REP-004", "FE-014"] },
    { q: "What date does each report use?", expectIds: ["REP-006", "FE-034"] },
    { q: "Why can Sales and Finance reports differ?", expectIds: ["REP-006", "FE-027", "FE-034", "FE-035"] },
    { q: "How do I select a reporting period?", expectIds: ["REP-007", "DASH-002"] },
    { q: "Which reports use Finance data?", expectIds: ["REP-003", "REP-004"] },
    { q: "Which reports use Sales data?", expectIds: ["REP-002", "FE-002"] },
    { q: "Which reports use Orders?", expectIds: ["REP-010", "FE-030"] },
    { q: "Does Reporting calculate financial rules itself?", expectIds: ["REP-008", "REP-001", "REP-003"] },
  ],
  "Reporting"
);

finish();
