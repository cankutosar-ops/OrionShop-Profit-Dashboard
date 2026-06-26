#!/usr/bin/env node
/**
 * Sprint 2: full sync in order (products → orders → sales → finance → stock)
 * Runs one entity per request to avoid HTTP timeouts.
 *
 * Usage: npx tsx scripts/run-sprint2-sync.mjs [dateFrom] [dateTo]
 */

import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

async function syncEntity(base, dateFrom, dateTo, entity) {
  console.log(`\n→ ${entity}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600_000);
  try {
    const res = await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateFrom, dateTo, entities: [entity] }),
      signal: controller.signal,
    });
    const body = await res.json();
    console.log(JSON.stringify(body, null, 2));
    if (!res.ok || !body.success) {
      throw new Error(`${entity} sync failed`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  loadEnv();
  const base = process.env.VERIFY_SYNC_URL ?? "http://localhost:3000";
  const dateFrom = process.argv[2] ?? "2026-05-24";
  const dateTo = process.argv[3] ?? "2026-06-23";

  console.log(`Sync base: ${base}`, { dateFrom, dateTo });

  for (const entity of ["products", "orders", "sales", "finance", "stock"]) {
    await syncEntity(base, dateFrom, dateTo, entity);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
