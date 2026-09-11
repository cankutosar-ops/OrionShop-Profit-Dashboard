/**
 * Shared Orion knowledge verification helpers.
 */

import { ORION_ALL_KNOWLEDGE_OBJECTS } from "../src/lib/orion/seed/all-objects.ts";
import { materializeRegistry, lookupById } from "../src/lib/orion/registry/service.ts";
import { retrieveKnowledge } from "../src/lib/orion/retriever/retriever.ts";
import { buildOrionAnswer } from "../src/lib/orion/assistant/answer-builder.ts";

export function ensureRegistryMaterialized() {
  materializeRegistry(ORION_ALL_KNOWLEDGE_OBJECTS);
}

export function createVerifier(title) {
  let failures = 0;

  function check(label, cond, detail = "") {
    if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
    else {
      failures += 1;
      console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    }
  }

  function runRetrievalTests(tests, contextModule) {
    for (const t of tests) {
      const result = retrieveKnowledge(t.q, contextModule ? { module: contextModule } : undefined);
      const topId = result.candidates[0]?.object.id;
      const matched = topId && t.expectIds.includes(topId);
      check(`Q: ${t.q}`, matched && !result.unknown, `top=${topId ?? "none"}`);
      if (matched && topId) {
        const obj = lookupById(topId);
        const answer = buildOrionAnswer(t.q, contextModule ? { module: contextModule } : undefined);
        check(
          `  ${topId} confidence`,
          obj?.confidence === "Verified" && answer.confidence !== "Unknown",
          obj?.confidence
        );
      }
    }
  }

  function finish() {
    console.log(`\n=== Result: ${failures === 0 ? "PASS" : `FAIL (${failures})`} ===`);
    process.exit(failures === 0 ? 0 : 1);
  }

  console.log(`=== ${title} ===\n`);
  ensureRegistryMaterialized();

  return { check, runRetrievalTests, finish };
}
