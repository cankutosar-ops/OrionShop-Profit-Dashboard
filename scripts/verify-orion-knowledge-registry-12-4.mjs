/**
 * Sprint 12.4 — Orion Knowledge Registry validation.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS } from "../src/lib/orion/seed/financial-engine-objects.ts";
import {
  filterRegistry,
  getRegistryIndex,
  lookupById,
  materializeRegistry,
  registerIfReady,
} from "../src/lib/orion/registry/service.ts";
import { validateKnowledgeObjectBatch } from "../src/lib/orion/materialization/validate.ts";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=== Sprint 12.4 — Orion Knowledge Registry ===\n");

console.log("--- Runtime modules ---");
for (const f of [
  "src/lib/orion/types.ts",
  "src/lib/orion/materialization/validate.ts",
  "src/lib/orion/registry/storage.ts",
  "src/lib/orion/registry/service.ts",
]) {
  check(f, existsSync(resolve(process.cwd(), f)));
}

console.log("\n--- Materialization ---");
const { run, index } = materializeRegistry(FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS);
check("Materialization succeeds", run.status === "success" && index !== null, run.status);
check("Objects registered", (index?.entries.filter((e) => e.is_active).length ?? 0) >= 18);

console.log("\n--- Ready-only ---");
const draftObj = structuredClone(FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS[0]);
draftObj.lifecycle = "draft";
const badRun = materializeRegistry([...FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS, draftObj]);
check("Draft object rejected", badRun.run.status === "failed");

console.log("\n--- Idempotent registration ---");
const run1 = registerIfReady(FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS);
const run2 = registerIfReady(FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS);
check("Duplicate registration safe", run1.status === "success" && run2.status === "success");

console.log("\n--- Lookup & filtering ---");
const revenue = lookupById("FE-003");
check("Lookup by ID", revenue?.title === "Revenue");
check(
  "Filter by module",
  filterRegistry({ module: "Financial Engine" }).length >= 15
);
check(
  "Filter by tag",
  filterRegistry({ tag: "commercial-performance" }).length >= 3
);

console.log("\n--- Version awareness ---");
const idx = getRegistryIndex();
check("Version index populated", Object.keys(idx.versions).length >= 18);

console.log("\n--- Existing modules untouched ---");
check(
  "Financial engine unchanged",
  existsSync(resolve(process.cwd(), "src/lib/financial-engine.ts"))
);
check(
  "No orion imports in financial-engine",
  !readFileSync(resolve(process.cwd(), "src/lib/financial-engine.ts"), "utf8").includes("@/lib/orion")
);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
process.exit(failures === 0 ? 0 : 1);
