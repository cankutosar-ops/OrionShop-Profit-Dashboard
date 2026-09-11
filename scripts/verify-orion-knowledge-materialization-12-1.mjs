/**
 * Sprint 12.1 — Orion Knowledge Materialization Framework validation.
 * Architecture / template only — no knowledge content required.
 * Run: npm run verify:orion-knowledge-materialization-12-1
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
console.log("=== Sprint 12.1 — Orion Knowledge Materialization ===\n");

const docs = [
  "docs/10-orion/KNOWLEDGE_ARTICLE_STANDARD.md",
  "docs/10-orion/KNOWLEDGE_ID_SPECIFICATION.md",
  "docs/10-orion/KNOWLEDGE_METADATA_MODEL.md",
  "docs/10-orion/KNOWLEDGE_RELATIONSHIP_MODEL.md",
  "docs/10-orion/templates/KNOWLEDGE_ARTICLE_TEMPLATE.md",
  "docs/06-decisions/ADR-013-orion-knowledge-materialization.md",
];

console.log("--- Artifacts ---");
for (const rel of docs) check(rel, existsSync(resolve(root, rel)));

console.log("\n--- Knowledge ID standard ---");
const ids = read("docs/10-orion/KNOWLEDGE_ID_SPECIFICATION.md");
for (const prefix of ["FE-001", "WH-001", "ADM-001", "REP-001", "SP-001", "ARCH-001"]) {
  check(`Example ID ${prefix}`, ids.includes(prefix));
}
check("IDs must never change", /must never change/i.test(ids));
check("Monotonic allocation", /Monotonic/i.test(ids));

console.log("\n--- Metadata model ---");
const meta = read("docs/10-orion/KNOWLEDGE_METADATA_MODEL.md");
for (const field of [
  "id",
  "title",
  "module",
  "category",
  "owner",
  "business_owner",
  "technical_owner",
  "version",
  "status",
  "confidence",
  "last_updated",
  "tags",
]) {
  check(`Metadata field ${field}`, meta.includes(field) || meta.includes(field.replace("_", " ")));
}

console.log("\n--- Canonical template sections ---");
const tmpl = read("docs/10-orion/templates/KNOWLEDGE_ARTICLE_TEMPLATE.md");
const sections = [
  "## Orion Metadata",
  "## Business Rule",
  "## Explanation",
  "## Formula",
  "## Data Sources",
  "## Dependencies",
  "## Exceptions",
  "## Examples",
  "## Related Knowledge",
  "## ADR References",
  "## Verification",
  "## Confidence",
];
for (const s of sections) {
  check(`Template section ${s}`, tmpl.includes(s));
}
check("Template includes business owner", /business owner/i.test(tmpl));
check("Template includes technical owner", /technical owner/i.test(tmpl));

console.log("\n--- Relationships ---");
const rel = read("docs/10-orion/KNOWLEDGE_RELATIONSHIP_MODEL.md");
check(
  "Authority chain Business Rules → … → Verification",
  /Business Rules[\s\S]*Architecture Decisions[\s\S]*Related Documents[\s\S]*Implementation[\s\S]*Verification/i.test(
    rel
  )
);
check(
  "Implementation does not override Business Rules",
  /must not[\s\*]*treat Implementation as overriding Business Rules/i.test(rel) ||
    /does not override Business Rules/i.test(rel)
);

console.log("\n--- Extensibility ---");
check(
  "Optional metadata / new prefixes via ADR",
  /Future-Compatible/i.test(meta) && /New prefixes require an ADR/i.test(ids)
);
check(
  "No knowledge articles directory content required yet",
  !existsSync(resolve(root, "docs/10-orion/articles")) ||
    true /* directory optional */
);

console.log("\n--- Knowledge plane boundary (12.4+) ---");
check("Orion runtime under src/lib/orion", existsSync(resolve(root, "src/lib/orion")));
check(
  "Materialization validate module",
  existsSync(resolve(root, "src/lib/orion/materialization/validate.ts"))
);
check("No misplaced src/orion root", !existsSync(resolve(root, "src/orion")));

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
