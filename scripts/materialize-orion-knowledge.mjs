/**
 * Materialize Orion Knowledge Objects into the registry.
 * Run: npm run materialize:orion-knowledge
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS,
  DASHBOARD_KNOWLEDGE_OBJECTS,
  REPORTING_KNOWLEDGE_OBJECTS,
  SMART_PRICING_KNOWLEDGE_OBJECTS,
  ADMINISTRATION_KNOWLEDGE_OBJECTS,
  WAREHOUSE_KNOWLEDGE_OBJECTS,
  ORION_ALL_KNOWLEDGE_OBJECTS,
} from "../src/lib/orion/seed/all-objects.ts";
import { materializeRegistry } from "../src/lib/orion/registry/service.ts";

const objectsDir = resolve(process.cwd(), "data", "orion", "objects");
mkdirSync(objectsDir, { recursive: true });

const bundles = [
  ["financial-engine-v4.json", FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS],
  ["dashboard.json", DASHBOARD_KNOWLEDGE_OBJECTS],
  ["reporting.json", REPORTING_KNOWLEDGE_OBJECTS],
  ["smart-pricing.json", SMART_PRICING_KNOWLEDGE_OBJECTS],
  ["administration.json", ADMINISTRATION_KNOWLEDGE_OBJECTS],
  ["warehouse-platform.json", WAREHOUSE_KNOWLEDGE_OBJECTS],
];

for (const [file, objects] of bundles) {
  writeFileSync(resolve(objectsDir, file), JSON.stringify(objects, null, 2), "utf8");
}

const { run, index } = materializeRegistry(ORION_ALL_KNOWLEDGE_OBJECTS);

console.log("=== Orion Knowledge Materialization ===");
console.log(`Run ID: ${run.run_id}`);
console.log(`Status: ${run.status}`);
console.log(`Processed: ${run.objects_processed}`);
console.log(`Registered: ${run.objects_registered}`);
console.log(`Financial Engine: ${FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS.length}`);
console.log(`Dashboard: ${DASHBOARD_KNOWLEDGE_OBJECTS.length}`);
console.log(`Reporting: ${REPORTING_KNOWLEDGE_OBJECTS.length}`);
console.log(`Smart Pricing: ${SMART_PRICING_KNOWLEDGE_OBJECTS.length}`);
console.log(`Administration: ${ADMINISTRATION_KNOWLEDGE_OBJECTS.length}`);
console.log(`Warehouse: ${WAREHOUSE_KNOWLEDGE_OBJECTS.length}`);

if (run.failures.length > 0) {
  console.log("\nFailures:");
  for (const f of run.failures) {
    console.log(`  [${f.rule}] ${f.id ?? "?"}: ${f.message}`);
  }
  process.exit(1);
}

if (!index) {
  console.error("Registry index not created.");
  process.exit(1);
}

console.log(`\nRegistry ready: ${index.entries.filter((e) => e.is_active).length} active objects`);
process.exit(0);
