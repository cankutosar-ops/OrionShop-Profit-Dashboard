/**
 * Sprint 12.8 — Orion Read-only API validation.
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

console.log("=== Sprint 12.8 — Orion Read-only API ===\n");

const routes = [
  "src/app/api/orion/search/route.ts",
  "src/app/api/orion/knowledge/[id]/route.ts",
  "src/app/api/orion/relationships/[id]/route.ts",
  "src/app/api/orion/sources/[id]/route.ts",
  "src/app/api/orion/explain/[id]/route.ts",
  "src/app/api/orion/diagnostics/route.ts",
  "src/app/api/orion/ask/route.ts",
];

console.log("--- API routes ---");
for (const r of routes) {
  check(r, existsSync(resolve(process.cwd(), r)));
}

console.log("\n--- Auth & read-only ---");
for (const r of routes) {
  const content = readFileSync(resolve(process.cwd(), r), "utf8");
  check(`${r} uses requireAuth`, content.includes("requireAuth"));
  check(`${r} no mutations`, !content.includes("INSERT") && !content.includes(".update("));
}

check("Service facade", existsSync(resolve(process.cwd(), "src/services/orion-knowledge-service.ts")));

const service = readFileSync(resolve(process.cwd(), "src/services/orion-knowledge-service.ts"), "utf8");
check("Service read-only", !service.includes("writeRegistry") && !service.includes("materializeRegistry"));

console.log(`\n=== Result: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
process.exit(failures === 0 ? 0 : 1);
