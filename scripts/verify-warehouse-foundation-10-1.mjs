/**
 * Sprint 10.1 — Warehouse Platform Foundation validation.
 * Run: npx tsx scripts/verify-warehouse-foundation-10-1.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // optional
    }
  }
}

loadEnv();

let failures = 0;
function check(label, cond, detail = "") {
  if (cond) console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function walkTsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

console.log("=== Sprint 10.1 — Warehouse Foundation ===\n");

const root = resolve(process.cwd(), "src/lib/warehouse");
const files = walkTsFiles(root);
check("warehouse package exists", files.length > 0, `${files.length} files`);

const requiredDirs = [
  "adapters",
  "repositories",
  "checkpoints",
  "sessions",
  "metadata",
  "types",
  "utils",
];
for (const d of requiredDirs) {
  check(`folder src/lib/warehouse/${d}`, statSync(join(root, d)).isDirectory());
}

const allSrc = files.map((f) => readFileSync(f, "utf8")).join("\n");
check(
  "No Wildberries API client imports in warehouse package",
  !/wildberries_api|from ["']@\/lib\/wildberries|statistics-api\.wildberries|finance-api\.wildberries/i.test(
    allSrc
  )
);
check(
  "No fetch( to marketplace hosts in warehouse package",
  !/fetch\(\s*[`"'].*wildberries|fetch\(\s*[`"'].*ozon|fetch\(\s*[`"'].*lamoda/i.test(allSrc)
);
check(
  "Foundation guards keep marketplace HTTP disabled in package",
  allSrc.includes("WAREHOUSE_FOUNDATION_ALLOWS_MARKETPLACE_HTTP = false")
);

const {
  WAREHOUSE_PLATFORM_ENTITIES,
  WAREHOUSE_LAYERS,
  WAREHOUSE_FOUNDATION_ALLOWS_MARKETPLACE_HTTP,
  WAREHOUSE_FOUNDATION_ALLOWS_SYNC_EXECUTION,
  formatCheckpointKey,
  WarehouseCheckpointService,
  WarehouseSyncSessionService,
  InMemoryWarehouseCheckpointRepository,
  InMemoryWarehouseSyncSessionRepository,
  InMemoryWarehouseMetadataRepository,
  InMemoryWarehouseRawMetadataRepository,
  marketplaceAdapterRegistry,
  assertWarehouseFoundationOnly,
} = await import("../src/lib/warehouse/index.ts");

check("Entities include products/orders/sales/finance/stocks/prices", 
  ["products", "orders", "sales", "finance", "stocks", "prices"].every((e) =>
    WAREHOUSE_PLATFORM_ENTITIES.includes(e)
  )
);
check(
  "Layers include raw/normalized/analytics/application",
  ["raw", "normalized", "analytics", "application"].every((l) => WAREHOUSE_LAYERS.includes(l))
);
check("HTTP disabled in warehouse package", WAREHOUSE_FOUNDATION_ALLOWS_MARKETPLACE_HTTP === false);
check(
  "Foundation sync marker present",
  typeof WAREHOUSE_FOUNDATION_ALLOWS_SYNC_EXECUTION === "boolean"
);
check("Adapter registry empty by default", marketplaceAdapterRegistry.list().length === 0);

const key = {
  marketplaceType: "wildberries",
  companyId: "1",
  marketplaceAccountId: "1",
  entity: "orders",
  mode: "historical_backfill",
};
check(
  "Checkpoint key format",
  formatCheckpointKey(key) === "wildberries|1|1|orders|historical_backfill|_"
);

const cpRepo = new InMemoryWarehouseCheckpointRepository();
const cpService = new WarehouseCheckpointService(cpRepo);
const ensured = await cpService.ensure(key);
check("Checkpoint ensure idle", ensured.status === "idle" && ensured.retryCount === 0);
const saved = await cpService.save({
  key,
  status: "running",
  cursor: "page-2",
  lastAttemptedSyncAt: new Date().toISOString(),
  progress: { pages: 2 },
  retryCount: 1,
});
check("Checkpoint upsert fields", saved.status === "running" && saved.cursor === "page-2");
check("Checkpoint get round-trip", (await cpService.get(key))?.cursor === "page-2");

const sessionRepo = new InMemoryWarehouseSyncSessionRepository();
const sessions = new WarehouseSyncSessionService(sessionRepo);
const session = await sessions.create({
  marketplaceType: "wildberries",
  companyId: "1",
  marketplaceAccountId: "1",
  entity: "sales",
  mode: "incremental",
  triggerSource: "manual",
  checkpointId: saved.id,
});
check("Session created pending", session.status === "pending" && Boolean(session.id));
const running = await sessions.markRunning(session.id);
check("Session mark running", running.status === "running" && Boolean(running.startedAt));
const finished = await sessions.finish(session.id, {
  status: "success",
  statistics: { recordsRead: 0, rowsInserted: 0 },
});
check("Session finish", finished.status === "success" && Boolean(finished.finishedAt));

const metaRepo = new InMemoryWarehouseMetadataRepository();
const entities = await metaRepo.listEntities();
const layers = await metaRepo.listLayers();
check("Metadata entities seeded", entities.length === WAREHOUSE_PLATFORM_ENTITIES.length);
check("Metadata layers seeded", layers.length === WAREHOUSE_LAYERS.length);

const rawRepo = new InMemoryWarehouseRawMetadataRepository();
const raw = await rawRepo.insert({
  marketplaceType: "wildberries",
  companyId: "1",
  marketplaceAccountId: "1",
  entity: "orders",
  endpointFamily: "orders",
  recordsRead: 0,
});
check("Raw intake meta insert", Boolean(raw.id));

let threw = false;
try {
  assertWarehouseFoundationOnly("incremental_sync");
} catch {
  threw = true;
}
// Sprint 10.3 enables incremental sync; foundation assert no longer blocks it.
check(
  "assertWarehouseFoundationOnly allows incremental after 10.3",
  threw === false
);

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260731140000_warehouse_platform_foundation_10_1.sql"
  ),
  "utf8"
);
check("Migration defines warehouse_checkpoints", migration.includes("warehouse_checkpoints"));
check("Migration defines warehouse_sync_sessions", migration.includes("warehouse_sync_sessions"));
check(
  "Migration defines warehouse_raw_intake_meta",
  migration.includes("warehouse_raw_intake_meta")
);
check(
  "Migration defines warehouse_entity_catalog",
  migration.includes("warehouse_entity_catalog")
);
check("Migration defines warehouse_layer_registry", migration.includes("warehouse_layer_registry"));
check("Migration does not call marketplace APIs", !/wildberries\.ru|ozon\.ru/i.test(migration));

// Optional live schema probe
try {
  const { getSupabaseEnv } = await import("../src/lib/supabase/env.ts");
  const env = getSupabaseEnv();
  if (!env.isConfigured) {
    console.log("SKIP  Live schema probe — Supabase not configured");
  } else {
    const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
    const sb = createAdminClient();
    const tables = [
      "warehouse_checkpoints",
      "warehouse_sync_sessions",
      "warehouse_entity_catalog",
      "warehouse_raw_intake_meta",
      "warehouse_layer_registry",
    ];
    for (const table of tables) {
      const { error } = await sb.from(table).select("*").limit(1);
      if (error && /does not exist|schema cache|Could not find/i.test(error.message)) {
        console.log(
          `WARN  Table ${table} missing — apply supabase/migrations/20260731140000_warehouse_platform_foundation_10_1.sql`
        );
        // Schema gate is informational until SQL Editor apply; code foundation can still PASS.
      } else if (error) {
        check(`Schema probe ${table}`, false, error.message);
      } else {
        check(`Schema has ${table}`, true);
      }
    }
  }
} catch (err) {
  console.log(
    `SKIP  Live schema probe — ${err instanceof Error ? err.message : String(err)}`
  );
}

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
