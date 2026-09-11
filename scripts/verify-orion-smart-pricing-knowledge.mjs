/**
 * Smart Pricing Knowledge validation + retrieval tests.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SMART_PRICING_KNOWLEDGE_OBJECTS } from "../src/lib/orion/seed/smart-pricing-objects.ts";
import { lookupById } from "../src/lib/orion/registry/service.ts";
import { createVerifier } from "./orion-knowledge-verify-utils.mjs";

const { check, runRetrievalTests, finish } = createVerifier("Orion Smart Pricing Knowledge Validation");

check("Seed module", existsSync(resolve(process.cwd(), "src/lib/orion/seed/smart-pricing-objects.ts")));

for (const id of SMART_PRICING_KNOWLEDGE_OBJECTS.map((o) => o.id)) {
  check(`Object ${id}`, !!lookupById(id), lookupById(id)?.title);
}

console.log("\n--- Retrieval tests (12) ---");
runRetrievalTests(
  [
    { q: "What does Smart Pricing calculate?", expectIds: ["SP-001"] },
    { q: "What is Effective Marketplace Cost?", expectIds: ["SP-003", "FE-036"] },
    { q: "What is Adaptive Logistics?", expectIds: ["SP-002"] },
    { q: "When does Product History apply?", expectIds: ["SP-006", "SP-002"] },
    { q: "When does Category History apply?", expectIds: ["SP-006", "SP-002"] },
    { q: "When does Account History apply?", expectIds: ["SP-006", "SP-002"] },
    { q: "What is the default date range?", expectIds: ["SP-005", "DASH-002"] },
    { q: "Does Smart Pricing modify Financial Engine?", expectIds: ["SP-007", "SP-001"] },
    { q: "What is the Profit Simulator?", expectIds: ["SP-004", "SP-001"] },
    { q: "Does Profit Simulator change real product costs?", expectIds: ["SP-004", "SP-001"] },
    {
      q: "Which fees are included in Effective Marketplace Cost?",
      expectIds: ["SP-003", "FE-036"],
    },
    {
      q: "What happens when there is insufficient product history?",
      expectIds: ["SP-006", "SP-002"],
    },
  ],
  "Smart Pricing"
);

finish();
