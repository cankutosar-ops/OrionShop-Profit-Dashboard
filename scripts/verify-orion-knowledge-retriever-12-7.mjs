/**
 * Sprint 12.7 — Orion Deterministic Retriever validation.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { retrieveKnowledge } from "../src/lib/orion/retriever/retriever.ts";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=== Sprint 12.7 — Orion Deterministic Retriever ===\n");

check("Retriever module", existsSync(resolve(process.cwd(), "src/lib/orion/retriever/retriever.ts")));

const tests = [
  { query: "How is Revenue calculated?", expectId: "FE-003" },
  { query: "Net Profit", expectId: "FE-013" },
  { query: "Marketplace Fee", expectId: "FE-004" },
  { query: "Model B", expectId: "FE-016" },
  { query: "Model C", expectId: "FE-017" },
  { query: "FE-012", expectId: "FE-012" },
];

console.log("\n--- Financial Engine retrieval ---");
for (const t of tests) {
  const result = retrieveKnowledge(t.query);
  const top = result.candidates[0]?.object.id;
  check(`Query: ${t.query}`, top === t.expectId, top);
}

console.log("\n--- Unknown state ---");
const unknown = retrieveKnowledge("xyzzy completely unknown nonsense term 12345");
check("Unknown query", unknown.unknown === true && unknown.candidates.length === 0);

console.log("\n--- Authority ranking ---");
const revenueResult = retrieveKnowledge("revenue seller payable");
check(
  "Verified ranks first",
  revenueResult.candidates[0]?.object.confidence === "Verified"
);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
process.exit(failures === 0 ? 0 : 1);
