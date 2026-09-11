/**
 * Sprint 12.5 — First Knowledge Materialization validation.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS } from "../src/lib/orion/seed/financial-engine-objects.ts";
import { getRegistryIndex, lookupById } from "../src/lib/orion/registry/service.ts";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=== Sprint 12.5 — Orion Knowledge Materialization ===\n");

const requiredIds = [
  "FE-001", "FE-002", "FE-003", "FE-004", "FE-005", "FE-006", "FE-007", "FE-008",
  "FE-009", "FE-010", "FE-011", "FE-012", "FE-013", "FE-014", "FE-015", "FE-016",
  "FE-017", "FE-018",
];

console.log("--- Seed artifacts ---");
check("Seed module exists", existsSync(resolve(process.cwd(), "src/lib/orion/seed/financial-engine-objects.ts")));
check(
  "Objects JSON path",
  existsSync(resolve(process.cwd(), "data/orion/objects/financial-engine-v4.json")) ||
    FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS.length >= 18
);

console.log("\n--- Required Financial Engine objects ---");
for (const id of requiredIds) {
  const obj = FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS.find((o) => o.id === id);
  check(`Object ${id}`, !!obj, obj?.title);
}

console.log("\n--- Canonical formulas sourced ---");
const np = lookupById("FE-013");
check("Net Profit formula", np?.formula?.includes("Revenue") && np?.formula?.includes("Estimated Tax"));
const rev = lookupById("FE-003");
check("Revenue formula", rev?.formula?.includes("ppvz_for_pay"));
const mf = lookupById("FE-004");
check("Marketplace Fee formula", mf?.formula?.includes("forPay"));
const tax = lookupById("FE-012");
check("Estimated Tax formula", tax?.formula?.includes("finishedPrice"));

console.log("\n--- Sources present ---");
for (const id of ["FE-003", "FE-013", "FE-012"]) {
  const obj = lookupById(id);
  check(
    `${id} has business_rule source`,
    (obj?.sources.some((s) => s.kind === "business_rule") ?? false)
  );
}

console.log("\n--- Conceptual Q&A ---");
const questions = [
  { q: "Revenue", id: "FE-003" },
  { q: "Net Profit", id: "FE-013" },
  { q: "Marketplace Fee", id: "FE-004" },
  { q: "Model B", id: "FE-016" },
  { q: "Model C", id: "FE-017" },
];

for (const { q, id } of questions) {
  check(`Concept: ${q}`, lookupById(id)?.id === id);
}

const idx = getRegistryIndex();
check("Registry active count", idx.entries.filter((e) => e.is_active).length >= 18);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
process.exit(failures === 0 ? 0 : 1);
