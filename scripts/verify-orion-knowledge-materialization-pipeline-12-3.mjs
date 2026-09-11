/**
 * Sprint 12.3 — Orion Knowledge Materialization Pipeline (architecture only).
 * Run: npm run verify:orion-knowledge-materialization-pipeline-12-3
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const root = resolve(process.cwd());
console.log("=== Sprint 12.3 — Orion Knowledge Materialization Pipeline ===\n");

const docs = [
  "docs/10-orion/KNOWLEDGE_MATERIALIZATION_PIPELINE.md",
  "docs/10-orion/MATERIALIZATION_PIPELINE_STAGES.md",
  "docs/10-orion/MATERIALIZATION_VALIDATION_MODEL.md",
  "docs/10-orion/MATERIALIZATION_REGISTRY_REGISTRATION.md",
  "docs/10-orion/MATERIALIZATION_OUTPUTS.md",
  "docs/10-orion/MATERIALIZATION_FAILURE_MODEL.md",
  "docs/06-decisions/ADR-015-orion-knowledge-materialization-pipeline.md",
];

console.log("--- Artifacts ---");
for (const rel of docs) check(rel, existsSync(resolve(root, rel)));

console.log("\n--- Pipeline ---");
const pipe = read("docs/10-orion/KNOWLEDGE_MATERIALIZATION_PIPELINE.md");
check("Objects never enter Orion directly", /never enter Orion directly/i.test(pipe));
const stages = [
  "Validation",
  "Authority Validation",
  "Relationship Validation",
  "Ownership Validation",
  "Knowledge ID Validation",
  "Version Validation",
  "Registry Registration",
  "Representation Generation",
  "Index Generation",
  "Ready for Retrieval",
];
for (const s of stages) check(`Pipeline stage ${s}`, pipe.includes(s));

console.log("\n--- Validation model ---");
const val = read("docs/10-orion/MATERIALIZATION_VALIDATION_MODEL.md");
for (const r of [
  "VAL-ID-UNIQUE",
  "VAL-META-REQUIRED",
  "VAL-OWNER-REQUIRED",
  "VAL-AUTHORITY-REQUIRED",
  "VAL-CONFIDENCE-REQUIRED",
  "VAL-REL-INTEGRITY",
  "VAL-VERSION-INTEGRITY",
  "VAL-LIFECYCLE-VALID",
  "AUTH-HIERARCHY",
  "REL-TARGET-EXISTS",
  "REL-NO-CIRCULAR-OWNERSHIP",
]) {
  check(`Rule ${r}`, val.includes(r));
}
check(
  "Must never enter Orion on failure",
  /must never enter Orion/i.test(val)
);

console.log("\n--- Authority / relationships ---");
check("Business Rule references validated", /Business Rule/i.test(val));
check("Implementation cannot sole-support Verified", /AUTH-NO-IMPL-VERIFIED/.test(val));
check("Broken references forbidden", /REL-NO-BROKEN|dangling/i.test(val));

console.log("\n--- Registry / representations / indexes ---");
const reg = read("docs/10-orion/MATERIALIZATION_REGISTRY_REGISTRATION.md");
const out = read("docs/10-orion/MATERIALIZATION_OUTPUTS.md");
check("Registry validated only", /REG-VALIDATED-ONLY|only.*validated/i.test(reg));
check("Representations are outputs", /outputs/i.test(out));
for (const idx of [
  "By Module",
  "By Category",
  "By Owner",
  "By Business Rule",
  "By ADR",
  "By Tag",
  "By Confidence",
  "By Relationship",
]) {
  check(`Index ${idx}`, out.includes(idx));
}

console.log("\n--- Failure & future ---");
const fail = read("docs/10-orion/MATERIALIZATION_FAILURE_MODEL.md");
check("No automatic fixes", /No automatic fixes/i.test(fail));
check("No silent corrections", /No silent corrections/i.test(fail));
check("Deterministic diagnostics", /deterministic diagnostics/i.test(fail));
const roadmap = read("docs/10-orion/ROADMAP.md");
check("Roadmap includes 12.3 pipeline", /12\.3 Materialization Pipeline/i.test(roadmap));
check("AI drafts / multi-language / video future", /AI-generated drafts/i.test(roadmap) && /Video/i.test(roadmap));

console.log("\n--- Knowledge plane boundary (12.4+) ---");
check("Orion runtime under src/lib/orion", existsSync(resolve(root, "src/lib/orion")));
check(
  "Pipeline validate module",
  existsSync(resolve(root, "src/lib/orion/materialization/validate.ts"))
);
check("Registry storage exists", existsSync(resolve(root, "src/lib/orion/registry/storage.ts")));
check("No misplaced src/orion root", !existsSync(resolve(root, "src/orion")));

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
