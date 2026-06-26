#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const { createWbSyncService } = await import("../src/lib/wildberries/sync-service.ts");
const { resolveMarketplaceAccountId } = await import("../src/services/marketplace-account-service.ts");

const from = process.env.AUDIT_FROM || "2026-05-24";
const to = process.env.AUDIT_TO || "2026-06-23";

const { marketplaceAccountId } = await resolveMarketplaceAccountId(null, null);
console.log(`Syncing finance ${from} → ${to} for account ${marketplaceAccountId}...`);
const service = await createWbSyncService(marketplaceAccountId);
const result = await service.syncFinance(from, to);
console.log(JSON.stringify(result, null, 2));
