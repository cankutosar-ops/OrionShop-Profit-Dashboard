/**
 * Financial Engine Knowledge validation + 20 retrieval tests.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS } from "../src/lib/orion/seed/financial-engine-objects.ts";
import { lookupById } from "../src/lib/orion/registry/service.ts";
import { createVerifier } from "./orion-knowledge-verify-utils.mjs";

const { check, runRetrievalTests, finish } = createVerifier(
  "Orion Financial Engine Knowledge Validation"
);

const requiredIds = FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS.map((o) => o.id);

check("Seed module", existsSync(resolve(process.cwd(), "src/lib/orion/seed/financial-engine-objects.ts")));

console.log("\n--- Required objects ---");
for (const id of requiredIds) {
  const obj = lookupById(id);
  check(`Object ${id}`, !!obj, obj?.title);
}

check("FE object count ≥ 36", FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS.length >= 36);

console.log("\n--- Canonical formulas ---");
check("Revenue formula", lookupById("FE-003")?.formula?.includes("ppvz_for_pay"));
check("Net Profit formula", lookupById("FE-013")?.formula?.includes("Estimated Tax"));
check("Marketplace Fee formula", lookupById("FE-004")?.formula?.includes("forPay"));

console.log("\n--- Retrieval tests (20) ---");
runRetrievalTests(
  [
    { q: "How is Gross Sales calculated?", expectIds: ["FE-001"] },
    { q: "What is Sales?", expectIds: ["FE-002", "FE-027"] },
    { q: "What is Revenue?", expectIds: ["FE-003"] },
    { q: "What is the difference between Sales and Revenue?", expectIds: ["FE-027", "FE-002", "FE-003"] },
    { q: "What is Marketplace Fee?", expectIds: ["FE-004"] },
    { q: "How is Marketplace Fee calculated?", expectIds: ["FE-004"] },
    { q: "What is priceWithDisc?", expectIds: ["FE-019", "FE-002"] },
    { q: "What is finishedPrice?", expectIds: ["FE-020", "FE-012"] },
    { q: "What is forPay?", expectIds: ["FE-021", "FE-004"] },
    { q: "What is ppvz_for_pay?", expectIds: ["FE-022", "FE-003"] },
    { q: "How is Net Profit calculated?", expectIds: ["FE-013"] },
    { q: "What is Estimated Tax?", expectIds: ["FE-012"] },
    { q: "What is Model B?", expectIds: ["FE-016"] },
    { q: "What is Model C?", expectIds: ["FE-017"] },
    { q: "What is WB Settlement?", expectIds: ["FE-014", "REP-004", "DASH-008"] },
    {
      q: "Why can Sales API forPay differ from Finance ppvz_for_pay?",
      expectIds: ["FE-035", "FE-021", "FE-022"],
    },
    { q: "How are returns handled?", expectIds: ["FE-015", "FE-029"] },
    { q: "How is Product Cost calculated?", expectIds: ["FE-005"] },
    {
      q: "What is the difference between Revenue and Settlement?",
      expectIds: ["FE-027", "DASH-010", "REP-004", "FE-014", "FE-003"],
    },
    {
      q: "Which date determines Finance settlement reporting?",
      expectIds: ["FE-034", "FE-022"],
    },
  ],
  "Financial Engine"
);

finish();
