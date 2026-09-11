/**
 * Administration Knowledge validation + retrieval tests.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ADMINISTRATION_KNOWLEDGE_OBJECTS } from "../src/lib/orion/seed/administration-objects.ts";
import { lookupById } from "../src/lib/orion/registry/service.ts";
import { createVerifier } from "./orion-knowledge-verify-utils.mjs";

const { check, runRetrievalTests, finish } = createVerifier(
  "Orion Administration Knowledge Validation"
);

check("Seed module", existsSync(resolve(process.cwd(), "src/lib/orion/seed/administration-objects.ts")));

for (const id of ADMINISTRATION_KNOWLEDGE_OBJECTS.map((o) => o.id)) {
  check(`Object ${id}`, !!lookupById(id), lookupById(id)?.title);
}

console.log("\n--- Retrieval tests (14) ---");
runRetrievalTests(
  [
    { q: "What does Administration control?", expectIds: ["ADM-001", "ADM-008"] },
    { q: "Does Administration calculate Net Profit?", expectIds: ["ADM-008", "ADM-001"] },
    { q: "Where are marketplace credentials managed?", expectIds: ["ADM-004"] },
    { q: "Where are platform settings stored?", expectIds: ["ADM-007"] },
    { q: "What is the ThemeProvider?", expectIds: ["ADM-013"] },
    { q: "What are Feature Flags?", expectIds: ["ADM-011"] },
    { q: "What is Data Retention?", expectIds: ["ADM-012"] },
    {
      q: "Does Administration control Warehouse sync engines?",
      expectIds: ["ADM-008", "ADM-014"],
    },
    {
      q: "What is the difference between Authentication and Authorization?",
      expectIds: ["ADM-009"],
    },
    { q: "Where are security events generated?", expectIds: ["ADM-006"] },
    { q: "What does Company Workspace own?", expectIds: ["ADM-003"] },
    { q: "Does Administration own tax settings?", expectIds: ["ADM-003", "ADM-008"] },
    { q: "Does Administration own marketplace credentials?", expectIds: ["ADM-004"] },
    { q: "What does Platform Settings control?", expectIds: ["ADM-007"] },
  ],
  "Administration"
);

finish();
