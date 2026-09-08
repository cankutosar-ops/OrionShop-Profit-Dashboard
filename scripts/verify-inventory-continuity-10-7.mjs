/**
 * Sprint 10.7 — Historical Inventory Continuity validation.
 * Run: npx tsx scripts/verify-inventory-continuity-10-7.mjs
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

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const root = resolve(process.cwd());
console.log("=== Sprint 10.7 — Historical Inventory Continuity ===\n");

console.log("--- Artifacts ---");
for (const rel of [
  "src/services/inventory-snapshot-continuity-service.ts",
  "src/services/inventory-snapshot-continuity-scheduler.ts",
  "src/services/inventory-daily-snapshot-service.ts",
  "src/instrumentation.ts",
  "src/app/api/warehouse/inventory-daily-snapshot/route.ts",
]) {
  check(rel, existsSync(resolve(root, rel)));
}

console.log("\n--- Independence from Dashboard Sync ---");
const continuity = read("src/services/inventory-snapshot-continuity-service.ts");
const schedulerBootstrap = read("src/services/inventory-snapshot-continuity-scheduler.ts");
const instr = read("src/instrumentation.ts");
const syncJob = read("src/services/sync-job-service.ts");
check(
  "Continuity scheduler started from instrumentation (thin Node bootstrap)",
  instr.includes("startInventorySnapshotContinuityScheduler") &&
    instr.includes("inventory-snapshot-continuity-scheduler") &&
    !instr.includes("inventory-snapshot-continuity-service")
);
check(
  "Instrumentation gates scheduler on NEXT_RUNTIME === nodejs",
  /NEXT_RUNTIME\s*===\s*["']nodejs["']/.test(instr)
);
check(
  "Scheduler bootstrap has no static encryption/credentials/crypto imports",
  !schedulerBootstrap.includes("credentials/encryption") &&
    !schedulerBootstrap.includes('from "crypto"') &&
    !schedulerBootstrap.includes("marketplace-account-service") &&
    !schedulerBootstrap.includes("inventory-daily-snapshot-service") &&
    schedulerBootstrap.includes('import("@/services/inventory-snapshot-continuity-service")')
);
check(
  "Continuity service does not host scheduler (keeps Node-only graph off instrumentation)",
  !continuity.includes("startInventorySnapshotContinuityScheduler")
);
check(
  "Continuity does not import dashboard-sync-service",
  !continuity.includes("dashboard-sync-service") && !continuity.includes("executeDashboardSync")
);
check(
  "Dashboard sync is optional backup only (still may call continuity)",
  syncJob.includes("scheduleDailyInventorySnapshot")
);

console.log("\n--- Activation + gaps + retention ---");
const snap = read("src/services/inventory-daily-snapshot-service.ts");
check("resolveInventorySnapshotActivationDate exported", snap.includes("resolveInventorySnapshotActivationDate"));
check("detectMissingSnapshotDates accepts fromDate", snap.includes("fromDate"));
check("purgeExpiredInventorySnapshots exported", snap.includes("purgeExpiredInventorySnapshots"));
check(
  "Purge only historical_inventory_snapshots",
  /purgeExpiredInventorySnapshots[\s\S]*?historical_inventory_snapshots/.test(snap) &&
    !/purgeExpiredInventorySnapshots[\s\S]*?wb_orders/.test(snap)
);
check("Activation date stored in progress", snap.includes("activationDate"));

const settings = read("src/lib/administration/platform-settings-document.ts");
check("Default retention is 90 days", settings.includes("warehouseHistoryDays: 90"));

console.log("\n--- Reuse existing capture (no new engine) ---");
check(
  "Continuity reuses captureDailyInventorySnapshot",
  continuity.includes("captureDailyInventorySnapshot")
);
check(
  "API route uses continuity service",
  read("src/app/api/warehouse/inventory-daily-snapshot/route.ts").includes(
    "runInventorySnapshotContinuityForAccount"
  )
);

console.log("\n--- Out of scope untouched ---");
check(
  "Financial Engine not imported by continuity",
  !continuity.includes("financial-engine")
);
check(
  "Warehouse Sales Analytics not modified by continuity imports",
  !continuity.includes("warehouse-sales-analytics")
);
check(
  "Smart Pricing not imported",
  !continuity.includes("smart-pricing")
);

console.log("\n--- Pure logic: retention purge ---");
// Unit-level: purge cutoff math via service source
check(
  "Retention purge uses lt snapshot_date cutoff",
  snap.includes('.lt("snapshot_date", cutoff)') || snap.includes(".lt('snapshot_date', cutoff)")
);

console.log("\n--- Live soft checks (optional DB) ---");
try {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) {
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[t.slice(0, i).trim()] = v;
    }
  }
  const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
  const {
    resolveInventorySnapshotActivationDate: resolveAct,
    detectMissingSnapshotDates: detectMissing,
    purgeExpiredInventorySnapshots,
  } = await import("../src/services/inventory-daily-snapshot-service.ts");

  const act = await resolveAct("1");
  check("Acc1 activation date resolved", /^\d{4}-\d{2}-\d{2}$/.test(act), act);
  const missing = await detectMissing("1", { fromDate: act });
  check(
    "Gap detection from activation runs",
    Array.isArray(missing),
    `${missing.length} missing day(s) from ${act}`
  );
  // Dry retention with huge window — should purge 0 (no data loss in verify)
  const purged = await purgeExpiredInventorySnapshots("1", 36500);
  check("Retention purge callable (36500d → expect 0)", purged === 0, `purged=${purged}`);

  // Confirm FE tables untouched count probe
  const client = createAdminClient();
  const before = await client.from("wb_orders").select("*", { count: "exact", head: true });
  check("Orders table still readable (untouched)", !before.error, `count=${before.count}`);
} catch (e) {
  check("Live DB soft checks", false, e instanceof Error ? e.message : String(e));
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
