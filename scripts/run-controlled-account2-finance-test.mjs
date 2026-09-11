#!/usr/bin/env node
/** ONE controlled Account 2 finance attempt via runBlockingDashboardSync (orchestrator inner path). */
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const ACCOUNT = "2";
const today = "2026-08-27";

const { getMarketplaceAccountSyncState, releaseStaleSyncLockIfNeeded } = await import(
  "../src/services/marketplace-account-service.ts"
);
const { getCommercialEntityState, readLatestDataDateFromDb } = await import(
  "../src/services/commercial-entity-sync-state-service.ts"
);
const { isSyncJobRunning } = await import("../src/lib/wildberries/sync-runtime.ts");
const { runBlockingDashboardSync } = await import("../src/services/sync-job-service.ts");
const { resolveCommercialSyncWindow } = await import(
  "../src/lib/commercial-continuity/window.ts"
);

function dump(label, row, dbDate) {
  console.log(`\n${label}:`);
  console.log(JSON.stringify({ entityRow: row, wbFinanceLatest: dbDate }, null, 2));
}

await releaseStaleSyncLockIfNeeded(ACCOUNT);
const meta = await getMarketplaceAccountSyncState(ACCOUNT);
if (meta?.last_sync_status === "running" || isSyncJobRunning(ACCOUNT)) {
  console.error("STOP: Account 2 sync already running");
  process.exit(2);
}

dump("BEFORE", await getCommercialEntityState(ACCOUNT, "finance"), await readLatestDataDateFromDb(ACCOUNT, "finance"));

const latest = await readLatestDataDateFromDb(ACCOUNT, "finance");
const window = resolveCommercialSyncWindow({
  latestDataDate: latest,
  maxLookbackDays: 14,
  now: new Date(`${today}T12:00:00Z`),
});

console.log("\nEXECUTION (single runBlockingDashboardSync, finance only, 14d lookback):");
console.log(JSON.stringify(window));

const result = await runBlockingDashboardSync({
  marketplaceAccountId: ACCOUNT,
  dateFrom: window.dateFrom,
  dateTo: window.dateTo,
  entities: ["finance"],
  trigger: "recover",
});

const fr = result.results.find((r) => r.entity === "finance");
console.log("\nEXECUTION_RESULT:");
console.log(
  JSON.stringify(
    {
      success: result.success,
      lastSyncStatus: result.lastSyncStatus,
      finance: fr
        ? {
            processed: fr.recordsProcessed,
            inserted: fr.recordsInserted,
            updated: fr.recordsUpdated,
            errors: fr.errors,
          }
        : null,
    },
    null,
    2
  )
);

dump("AFTER", await getCommercialEntityState(ACCOUNT, "finance"), await readLatestDataDateFromDb(ACCOUNT, "finance"));
