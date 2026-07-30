#!/usr/bin/env node
/**
 * Sprint 9.3 — CI / production gate: read-only schema compatibility.
 * Exit 1 when required columns are missing. Never migrates.
 *
 * Usage: npx tsx scripts/validate-schema-compatibility.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        process.env[trimmed.slice(0, idx).trim()] ??= trimmed.slice(idx + 1).trim();
      }
    } catch {
      // optional
    }
  }
}

async function main() {
  loadEnv();
  const { checkSchemaCompatibility, logSchemaCompatibilityReport } = await import(
    "../src/lib/schema-compatibility-check.ts"
  );

  const report = await checkSchemaCompatibility();
  if (!report) {
    console.error("FAIL: Supabase env not configured — cannot validate schema.");
    process.exit(1);
  }

  logSchemaCompatibilityReport(report);

  const outDir = resolve(process.cwd(), "exports/browser-proof/sprint-9-3-orders-recovery");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "schema-compatibility.json"), JSON.stringify(report, null, 2));

  if (!report.compatible) {
    process.exit(1);
  }

  console.log("OK: schema compatible with application requirements.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
