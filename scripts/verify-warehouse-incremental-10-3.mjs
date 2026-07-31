/**
 * Sprint 10.3 — Incremental Sync Engine validation.
 * Run: npx tsx scripts/verify-warehouse-incremental-10-3.mjs
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

console.log("=== Sprint 10.3 — Incremental Sync Engine ===\n");

const warehouseRoot = resolve(process.cwd(), "src/lib/warehouse");
const warehouseFiles = walkTsFiles(warehouseRoot);
const warehouseSrc = warehouseFiles.map((f) => readFileSync(f, "utf8")).join("\n");

check(
  "No Wildberries HTTP client imports inside warehouse package",
  !/from ["']@\/lib\/wildberries|statistics-api\.wildberries|finance-api\.wildberries/i.test(
    warehouseSrc
  )
);
check(
  "Incremental package present",
  warehouseFiles.some((f) => /incremental[\\/]engine\.ts$/.test(f))
);
check(
  "Incremental sync allowed",
  warehouseSrc.includes("WAREHOUSE_ALLOWS_INCREMENTAL_SYNC = true")
);
check(
  "Historical backfill engine file untouched for HTTP",
  !readFileSync(resolve(warehouseRoot, "backfill/engine.ts"), "utf8").includes(
    "@/lib/wildberries"
  )
);

const {
  HistoricalBackfillEngine,
  IncrementalSyncEngine,
  INCREMENTAL_SYNC_ENTITY_ORDER,
  INCREMENTAL_SYNC_MODE,
  InMemoryWarehouseEntityUpsert,
  MockMarketplaceAdapter,
  WarehouseCheckpointService,
  WarehouseSyncSessionService,
  InMemoryWarehouseCheckpointRepository,
  InMemoryWarehouseSyncSessionRepository,
  InMemoryWarehouseRawMetadataRepository,
  evaluateIncrementalEligibility,
  WAREHOUSE_ALLOWS_INCREMENTAL_SYNC,
  createRecordingIncrementalLogger,
} = await import("../src/lib/warehouse/index.ts");

check("Incremental flag true", WAREHOUSE_ALLOWS_INCREMENTAL_SYNC === true);
check(
  "Incremental entity order",
  INCREMENTAL_SYNC_ENTITY_ORDER.join(",") ===
    "products,orders,sales,finance,stocks,prices"
);
check("Incremental mode is schema-compatible", INCREMENTAL_SYNC_MODE === "incremental");

const apiRoute = resolve(
  process.cwd(),
  "src/app/api/warehouse/incremental-sync/route.ts"
);
check(
  "API route exists",
  (() => {
    try {
      return readFileSync(apiRoute, "utf8").includes("runIncrementalSync");
    } catch {
      return false;
    }
  })()
);

async function seedHistorical(scope, checkpoints, sessions, upsert, rawRepo) {
  const engine = new HistoricalBackfillEngine({
    adapter: new MockMarketplaceAdapter(),
    upsert,
    checkpoints,
    sessions,
    rawMetadata: rawRepo,
  });
  return engine.run({
    scope,
    historyFrom: "2026-01-01",
    historyTo: "2026-01-07",
    trigger: "lifecycle",
    windowDays: 7,
  });
}

// --- Blocked without historical completion ---
{
  const cpRepo = new InMemoryWarehouseCheckpointRepository();
  const sessionRepo = new InMemoryWarehouseSyncSessionRepository();
  const upsert = new InMemoryWarehouseEntityUpsert();
  const engine = new IncrementalSyncEngine({
    adapter: new MockMarketplaceAdapter(),
    upsert,
    checkpoints: new WarehouseCheckpointService(cpRepo),
    sessions: new WarehouseSyncSessionService(sessionRepo),
  });
  const blocked = await engine.run({
    scope: {
      marketplaceType: "wildberries",
      companyId: "1",
      marketplaceAccountId: "blocked-1",
    },
    trigger: "manual",
  });
  check("Blocked without historical backfill", blocked.status === "blocked");
  check("No session when blocked", blocked.sessionId === null);
  check("Eligibility false when blocked", blocked.eligibility.eligible === false);
}

// --- Full successful incremental after historical ---
{
  const cpRepo = new InMemoryWarehouseCheckpointRepository();
  const sessionRepo = new InMemoryWarehouseSyncSessionRepository();
  const rawRepo = new InMemoryWarehouseRawMetadataRepository();
  const upsert = new InMemoryWarehouseEntityUpsert();
  const checkpoints = new WarehouseCheckpointService(cpRepo);
  const sessions = new WarehouseSyncSessionService(sessionRepo);
  const scope = {
    marketplaceType: "wildberries",
    companyId: "1",
    marketplaceAccountId: "inc-100",
  };

  const hist = await seedHistorical(scope, checkpoints, sessions, upsert, rawRepo);
  check("Historical seed success", hist.status === "success");
  check(
    "Eligible after historical",
    evaluateIncrementalEligibility(await cpRepo.listByAccount("inc-100"), "inc-100").eligible
  );

  const { logger, events } = createRecordingIncrementalLogger();
  const engine = new IncrementalSyncEngine({
    adapter: new MockMarketplaceAdapter(),
    upsert,
    checkpoints,
    sessions,
    rawMetadata: rawRepo,
    logger,
  });

  const result1 = await engine.run({ scope, trigger: "manual" });
  check("Incremental session created", Boolean(result1.sessionId));
  check("Incremental status success", result1.status === "success");
  check(
    "All entities success",
    result1.entityResults.length === 6 &&
      result1.entityResults.every((r) => r.status === "success")
  );
  check(
    "Session start + completion logged",
    events.some((e) => e.event === "session_start") &&
      events.some((e) => e.event === "completion")
  );

  const session = await sessionRepo.getById(result1.sessionId);
  check(
    "Session recorded success",
    session?.status === "success" && session?.mode === "incremental"
  );

  const incCps = (await cpRepo.listByAccount("inc-100")).filter(
    (c) => c.mode === "incremental"
  );
  check(
    "Incremental checkpoints complete",
    INCREMENTAL_SYNC_ENTITY_ORDER.every((entity) =>
      incCps.some((c) => c.entity === entity && c.status === "complete")
    )
  );

  const productCountAfterFirst = upsert.count("products");

  // Idempotent second run
  const result2 = await engine.run({ scope, trigger: "api" });
  check("Second incremental run success", result2.status === "success");
  check(
    "Idempotent product count",
    upsert.count("products") === productCountAfterFirst,
    `count=${upsert.count("products")}`
  );
}

// --- Entity independence: failure pauses later entities ---
{
  const cpRepo = new InMemoryWarehouseCheckpointRepository();
  const sessionRepo = new InMemoryWarehouseSyncSessionRepository();
  const rawRepo = new InMemoryWarehouseRawMetadataRepository();
  const upsert = new InMemoryWarehouseEntityUpsert();
  const checkpoints = new WarehouseCheckpointService(cpRepo);
  const sessions = new WarehouseSyncSessionService(sessionRepo);
  const scope = {
    marketplaceType: "wildberries",
    companyId: "1",
    marketplaceAccountId: "inc-200",
  };

  await seedHistorical(scope, checkpoints, sessions, upsert, rawRepo);

  const failEngine = new IncrementalSyncEngine({
    adapter: new MockMarketplaceAdapter({ failOnEntity: "sales" }),
    upsert,
    checkpoints,
    sessions,
    rawMetadata: rawRepo,
  });

  const partial = await failEngine.run({ scope, trigger: "manual" });
  check("Partial/failed status on entity failure", partial.status === "partial" || partial.status === "failed");
  check(
    "Products success before failure",
    partial.entityResults.find((r) => r.entity === "products")?.status === "success"
  );
  check(
    "Orders success before failure",
    partial.entityResults.find((r) => r.entity === "orders")?.status === "success"
  );
  check(
    "Sales failed",
    partial.entityResults.find((r) => r.entity === "sales")?.status === "failed"
  );
  check(
    "Finance paused",
    partial.entityResults.find((r) => r.entity === "finance")?.status === "paused"
  );
  check(
    "Stocks paused",
    partial.entityResults.find((r) => r.entity === "stocks")?.status === "paused"
  );
  check(
    "Prices paused",
    partial.entityResults.find((r) => r.entity === "prices")?.status === "paused"
  );

  const cps = await cpRepo.listByAccount("inc-200");
  check(
    "Completed entity checkpoints preserved",
    cps.some((c) => c.mode === "incremental" && c.entity === "products" && c.status === "complete") &&
      cps.some((c) => c.mode === "incremental" && c.entity === "orders" && c.status === "complete")
  );
  check(
    "Failed sales checkpoint preserved",
    cps.some((c) => c.mode === "incremental" && c.entity === "sales" && c.status === "failed")
  );

  // Resume with healthy adapter
  const resumeEngine = new IncrementalSyncEngine({
    adapter: new MockMarketplaceAdapter(),
    upsert,
    checkpoints,
    sessions,
    rawMetadata: rawRepo,
  });
  const resumed = await resumeEngine.run({ scope, trigger: "manual" });
  check("Resume after interruption succeeds", resumed.status === "success");
  check("Resume flagged", resumed.resumed === true);
  check(
    "All entities success after resume",
    resumed.entityResults.every((r) => r.status === "success")
  );
}

// Dashboard / reporting / financial engine / smart pricing untouched
const dashTouched = walkTsFiles(resolve(process.cwd(), "src/components/dashboard")).some((f) =>
  readFileSync(f, "utf8").includes("IncrementalSyncEngine")
);
const reportingTouched = walkTsFiles(resolve(process.cwd(), "src/lib/reporting")).some((f) =>
  readFileSync(f, "utf8").includes("IncrementalSyncEngine")
);
const smartPricingTouched = walkTsFiles(resolve(process.cwd(), "src/lib")).some(
  (f) =>
    f.includes("smart-pricing") &&
    readFileSync(f, "utf8").includes("IncrementalSyncEngine")
);
check("Dashboard unchanged", !dashTouched);
check("Reporting unchanged", !reportingTouched);
check("Smart Pricing unchanged", !smartPricingTouched);

// Historical backfill engine still present (not replaced)
check(
  "Historical backfill engine retained",
  warehouseFiles.some((f) => /backfill[\\/]engine\.ts$/.test(f))
);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
