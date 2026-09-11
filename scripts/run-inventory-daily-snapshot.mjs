#!/usr/bin/env node
/**
 * Sprint 10.7 — inventory continuity (capture + gaps + retention).
 * Usage:
 *   npm run warehouse:inventory-daily-snapshot
 *   npm run warehouse:inventory-daily-snapshot -- 1
 *   npm run warehouse:inventory-daily-snapshot -- 1 2026-07-26
 *   npm run warehouse:inventory-daily-snapshot -- all
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
    }
  }
}

loadEnv();

const arg1 = process.argv[2] || "all";
const snapshotDate = process.argv[3] || undefined;

const {
  runInventorySnapshotContinuityForAccount,
  runInventorySnapshotContinuityForAllAccounts,
} = await import("../src/services/inventory-snapshot-continuity-service.ts");

if (arg1 === "all") {
  const results = await runInventorySnapshotContinuityForAllAccounts({
    snapshotDate,
    trigger: "manual",
  });
  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.capture.status === "failed")) process.exit(2);
} else {
  const result = await runInventorySnapshotContinuityForAccount(arg1, {
    snapshotDate,
    trigger: "manual",
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.capture.status === "failed") process.exit(2);
}
