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

const from = process.argv[2] ?? "2026-05-24";
const to = process.argv[3] ?? "2026-06-23";
const entities = process.argv[4]?.split(",") ?? ["products", "orders", "sales", "finance", "stock"];
const accountArg = process.argv[5];

const { createWbSyncService } = await import("../src/lib/wildberries/sync-service.ts");
const { resolveMarketplaceAccountId } = await import("../src/services/marketplace-account-service.ts");

const { marketplaceAccountId } = accountArg
  ? { marketplaceAccountId: accountArg }
  : await resolveMarketplaceAccountId(null, null);
const svc = await createWbSyncService(marketplaceAccountId);

console.log(`Marketplace account: ${marketplaceAccountId}`);

for (const entity of entities) {
  console.log(`\n=== ${entity} ===`);
  let result;
  if (entity === "products") result = await svc.syncProducts();
  else if (entity === "orders") result = await svc.syncOrders(from, to);
  else if (entity === "sales") result = await svc.syncSales(from, to);
  else if (entity === "finance") result = await svc.syncFinance(from, to);
  else if (entity === "stock") result = await svc.syncStock();
  else throw new Error(`Unknown entity: ${entity}`);
  console.log(JSON.stringify(result, null, 2));
}
