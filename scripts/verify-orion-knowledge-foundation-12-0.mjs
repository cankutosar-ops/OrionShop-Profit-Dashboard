/**
 * Sprint 12.0 — Orion Knowledge Foundation validation (architecture docs only).
 * Run: npm run verify:orion-knowledge-foundation-12-0
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
console.log("=== Sprint 12.0 — Orion Knowledge Foundation ===\n");

const docs = [
  "docs/10-orion/README.md",
  "docs/10-orion/ORION_ARCHITECTURE.md",
  "docs/10-orion/KNOWLEDGE_HIERARCHY.md",
  "docs/10-orion/KNOWLEDGE_REGISTRY.md",
  "docs/10-orion/RETRIEVAL_STRATEGY.md",
  "docs/10-orion/CONFIDENCE_AND_CITATION.md",
  "docs/10-orion/OWNERSHIP.md",
  "docs/10-orion/ROADMAP.md",
  "docs/06-decisions/ADR-012-orion-knowledge-foundation.md",
];

console.log("--- Artifacts ---");
for (const rel of docs) {
  check(rel, existsSync(resolve(root, rel)));
}

console.log("\n--- Knowledge hierarchy ---");
const hierarchy = read("docs/10-orion/KNOWLEDGE_HIERARCHY.md");
check("Tier 1 defined", /Tier 1/i.test(hierarchy));
check("Tier 2 defined", /Tier 2/i.test(hierarchy));
check("Tier 3 defined", /Tier 3/i.test(hierarchy));
check(
  "Code must not override Business Rules",
  /never override Business Rules/i.test(hierarchy)
);

console.log("\n--- Retrieval ---");
const retrieval = read("docs/10-orion/RETRIEVAL_STRATEGY.md");
check("Business Rules first in order", /1\.\s*Business Rules/i.test(retrieval));
check("Source Code last in order", /8\.\s*Source Code/i.test(retrieval));
check("Never retrieve randomly", /Never retrieve randomly/i.test(retrieval));

console.log("\n--- Registry ---");
const registry = read("docs/10-orion/KNOWLEDGE_REGISTRY.md");
for (const field of [
  "id",
  "title",
  "category",
  "owner",
  "version",
  "status",
  "priority",
  "verification_level",
]) {
  check(`Registry field ${field}`, registry.includes(field) || registry.includes("`"+field+"`"));
}

console.log("\n--- Confidence & citation ---");
const conf = read("docs/10-orion/CONFIDENCE_AND_CITATION.md");
check("Verified level", /Verified/i.test(conf));
check("Derived level", /Derived/i.test(conf));
check("Implementation level", /Implementation/i.test(conf));
check("Unknown level", /Unknown/i.test(conf));
check(
  "Unknown phrase",
  conf.includes("I couldn't find verified project knowledge for this topic.")
);
check(
  "Citation shape Answer→Why→Sources→Confidence",
  /Answer[\s\S]*Why[\s\S]*Sources[\s\S]*Confidence/i.test(conf)
);

console.log("\n--- Ownership & extensibility ---");
const ownership = read("docs/10-orion/OWNERSHIP.md");
check("Financial Engine owns calculations knowledge", /Financial Engine/i.test(ownership));
check("Warehouse Platform owner present", /Warehouse Platform/i.test(ownership));
check(
  "Business Rules own calculations",
  /Business Rules always own calculations/i.test(ownership)
);
const roadmap = read("docs/10-orion/ROADMAP.md");
check("Future user documentation planned", /User Documentation/i.test(roadmap));
check("Future multi-language planned", /Multi-language/i.test(roadmap));
check("No redesign required for new sources", /without redesigning/i.test(roadmap));

console.log("\n--- Knowledge plane boundary (12.4+) ---");
const fe = read("src/lib/financial-engine.ts");
check(
  "Orion runtime under src/lib/orion",
  existsSync(resolve(root, "src/lib/orion"))
);
check(
  "Financial Engine does not import Orion",
  !fe.includes("@/lib/orion") && !fe.includes("orion-knowledge")
);
check(
  "No misplaced src/orion root",
  !existsSync(resolve(root, "src/orion"))
);
check(
  "Architecture docs declare no chat/LLM in Phase 1",
  read("docs/10-orion/README.md").includes("Chat UI") &&
    read("docs/10-orion/ORION_ARCHITECTURE.md").includes("No chat, no LLM")
);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
