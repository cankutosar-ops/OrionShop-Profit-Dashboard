/**
 * Sprint 12.9 — Orion Assistant UI validation.
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

console.log("=== Sprint 12.9 — Orion Assistant ===\n");

const files = [
  "src/app/orion/page.tsx",
  "src/components/orion/orion-assistant-panel.tsx",
  "src/components/orion/orion-confidence-badge.tsx",
  "src/lib/orion/assistant/answer-builder.ts",
  "src/app/api/orion/ask/route.ts",
];

for (const f of files) {
  check(f, existsSync(resolve(process.cwd(), f)));
}

const panel = readFileSync(resolve(process.cwd(), "src/components/orion/orion-assistant-panel.tsx"), "utf8");
check("Citation model: Answer", panel.includes("Answer"));
check("Citation model: Why", panel.includes("Why"));
check("Citation model: Sources", panel.includes("Sources"));
check("Confidence badge", panel.includes("OrionConfidenceBadge"));
check("Uses /api/orion/ask", panel.includes("/api/orion/ask"));

const sidebar = readFileSync(resolve(process.cwd(), "src/components/layout/sidebar.tsx"), "utf8");
check("Sidebar Orion link", sidebar.includes('href: "/orion"'));

const answerBuilder = readFileSync(resolve(process.cwd(), "src/lib/orion/assistant/answer-builder.ts"), "utf8");
check("Unknown state explicit", answerBuilder.includes("Unknown"));
check("No LLM as source", !answerBuilder.includes("openai") && !answerBuilder.includes("anthropic"));

console.log(`\n=== Result: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
process.exit(failures === 0 ? 0 : 1);
