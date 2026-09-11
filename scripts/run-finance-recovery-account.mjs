#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const accountId = process.argv[2] ?? "2";
const dateFrom = process.argv[3] ?? "2026-06-21";
const dateTo = process.argv[4] ?? "2026-08-27";

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { releaseStaleSyncLockIfNeeded } = await import(
  "../src/services/marketplace-account-service.ts"
);
const { runBlockingDashboardSync } = await import("../src/services/sync-job-service.ts");
const { readLatestDataDateFromDb } = await import(
  "../src/services/commercial-entity-sync-state-service.ts"
);

const released = await releaseStaleSyncLockIfNeeded(accountId);
console.log(`Stale lock released: ${released}`);

const sb = createAdminClient();
const { data: before } = await sb
  .from("marketplace_accounts")
  .select("last_sync_at,last_sync_status")
  .eq("id", accountId)
  .single();
console.log("Before:", before);
console.log("Finance latest before:", await readLatestDataDateFromDb(accountId, "finance"));

console.log(`\nFinance recovery ${dateFrom} → ${dateTo} for account ${accountId}...\n`);

const result = await runBlockingDashboardSync({
  marketplaceAccountId: accountId,
  dateFrom,
  dateTo,
  entities: ["finance"],
  trigger: "recover",
});

console.log("\nResult:", {
  success: result.success,
  status: result.lastSyncStatus,
  results: result.results,
});

const { data: after } = await sb
  .from("marketplace_accounts")
  .select("last_sync_at,last_sync_status")
  .eq("id", accountId)
  .single();
console.log("After:", after);
console.log("Finance latest after:", await readLatestDataDateFromDb(accountId, "finance"));
