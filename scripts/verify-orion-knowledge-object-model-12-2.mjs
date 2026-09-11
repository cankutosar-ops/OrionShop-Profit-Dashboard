/**
 * Sprint 12.2 — Orion Knowledge Object Model validation (architecture only).
 * Run: npm run verify:orion-knowledge-object-model-12-2
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
console.log("=== Sprint 12.2 — Orion Knowledge Object Model ===\n");

const docs = [
  "docs/10-orion/KNOWLEDGE_OBJECT_MODEL.md",
  "docs/10-orion/KNOWLEDGE_OBJECT_SPECIFICATION.md",
  "docs/10-orion/KNOWLEDGE_OBJECT_AUTHORITY.md",
  "docs/10-orion/KNOWLEDGE_OBJECT_RELATIONSHIP_GRAPH.md",
  "docs/10-orion/KNOWLEDGE_OBJECT_LIFECYCLE.md",
  "docs/10-orion/KNOWLEDGE_OBJECT_REPRESENTATIONS.md",
  "docs/06-decisions/ADR-014-orion-knowledge-object-model.md",
];

console.log("--- Artifacts ---");
for (const rel of docs) check(rel, existsSync(resolve(root, rel)));

console.log("\n--- Canonical object ---");
const spec = read("docs/10-orion/KNOWLEDGE_OBJECT_SPECIFICATION.md");
const model = read("docs/10-orion/KNOWLEDGE_OBJECT_MODEL.md");
check("Object is source of truth", /source of truth/i.test(model));
check("Article is representation", /representation/i.test(model));
for (const section of [
  "## 1. Identity",
  "## 2. Classification",
  "## 3. Authority",
  "## 4. Relationships",
  "## 5. Sources",
  "## 6. Search Metadata",
]) {
  check(`Spec section ${section}`, spec.includes(section));
}
for (const f of ["id", "title", "aliases", "description", "keywords", "synonyms", "abbreviations"]) {
  check(`Identity/search field ${f}`, spec.includes(`\`${f}\``) || spec.includes(`| \`${f}\``) || spec.includes(f));
}

console.log("\n--- Authority ---");
const auth = read("docs/10-orion/KNOWLEDGE_OBJECT_AUTHORITY.md");
check(
  "Authority chain Business Rules → … → Implementation",
  /Business Rules[\s\S]*Architecture Decisions[\s\S]*Documentation[\s\S]*Implementation/i.test(auth)
);
check(
  "Implementation never overrides Business Rules",
  /Implementation never overrides Business Rules/i.test(auth)
);

console.log("\n--- Relationships ---");
const graph = read("docs/10-orion/KNOWLEDGE_OBJECT_RELATIONSHIP_GRAPH.md");
for (const t of [
  "depends_on",
  "used_by",
  "implements",
  "references",
  "extends",
  "related_to",
  "verified_by",
  "defined_by",
  "superseded_by",
]) {
  check(`Relationship type ${t}`, graph.includes(t));
}
check("Knowledge is a graph", /graph/i.test(graph));

console.log("\n--- Ownership / lifecycle / versioning ---");
const life = read("docs/10-orion/KNOWLEDGE_OBJECT_LIFECYCLE.md");
const repr = read("docs/10-orion/KNOWLEDGE_OBJECT_REPRESENTATIONS.md");
for (const s of ["draft", "verified", "deprecated", "archived", "superseded"]) {
  check(`Lifecycle ${s}`, life.includes(`\`${s}\``) || life.includes(s));
}
check("ID never changes", /never changes/i.test(life));
check("Business Rules own calculations", /Business Rules always own calculations/i.test(repr));
check("Single owner", /single/i.test(repr) && /owner/i.test(repr));

console.log("\n--- Human representation & future ---");
check("Object → Article mapping", /Object → Article/i.test(repr) || /Object field/i.test(repr));
check("Help Center / tooltips supported", /Help Center/i.test(repr) && /Tooltip/i.test(repr));
const roadmap = read("docs/10-orion/ROADMAP.md");
check("Roadmap includes 12.2 Knowledge Object", /12\.2 Knowledge Object/i.test(roadmap));
check(
  "Multi-language / context-aware without redesign",
  /Multi-language/i.test(roadmap) || /localized/i.test(spec)
);

console.log("\n--- Knowledge plane boundary (12.4+) ---");
check("Orion runtime under src/lib/orion", existsSync(resolve(root, "src/lib/orion")));
check("Registry service exists", existsSync(resolve(root, "src/lib/orion/registry/service.ts")));
check("No misplaced src/orion root", !existsSync(resolve(root, "src/orion")));

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
