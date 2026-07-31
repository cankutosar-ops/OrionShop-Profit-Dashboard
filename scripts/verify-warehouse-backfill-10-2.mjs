/**
 * Sprint 10.2 — Historical Backfill Engine validation.
 * Run: npx tsx scripts/verify-warehouse-backfill-10-2.mjs
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

console.log("=== Sprint 10.2 — Historical Backfill Engine ===\n");

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
  "Backfill engine package present",
  warehouseFiles.some((f) => f.includes(`${join("backfill", "engine")}`)) ||
    warehouseFiles.some((f) => /backfill[\\/]engine\.ts$/.test(f))
);
check(
  "Historical backfill remains allowed",
  warehouseSrc.includes("WAREHOUSE_ALLOWS_HISTORICAL_BACKFILL = true")
);

const {
  HISTORICAL_BACKFILL_ENTITY_ORDER,
  HistoricalBackfillEngine,
  InMemoryWarehouseEntityUpsert,
  MockMarketplaceAdapter,
  WarehouseCheckpointService,
  WarehouseSyncSessionService,
  InMemoryWarehouseCheckpointRepository,
  InMemoryWarehouseSyncSessionRepository,
  InMemoryWarehouseRawMetadataRepository,
  evaluateIncrementalEligibility,
  createRecordingBackfillLogger,
} = await import("../src/lib/warehouse/index.ts");

check(
  "Locked entity order",
  HISTORICAL_BACKFILL_ENTITY_ORDER.join(",") ===
    "products,orders,sales,finance,stocks,prices"
);

const adapterPath = resolve(
  process.cwd(),
  "src/lib/marketplace-adapters/wildberries/warehouse-adapter.ts"
);
check(
  "WB adapter lives outside warehouse package",
  (() => {
    try {
      return readFileSync(adapterPath, "utf8").includes("WildberriesMarketplaceAdapter");
    } catch {
      return false;
    }
  })()
);

const apiRoute = resolve(
  process.cwd(),
  "src/app/api/warehouse/historical-backfill/route.ts"
);
check(
  "API route exists",
  (() => {
    try {
      return readFileSync(apiRoute, "utf8").includes("runHistoricalBackfill");
    } catch {
      return false;
    }
  })()
);

// --- Functional: full successful backfill ---
const cpRepo = new InMemoryWarehouseCheckpointRepository();
const sessionRepo = new InMemoryWarehouseSyncSessionRepository();
const rawRepo = new InMemoryWarehouseRawMetadataRepository();
const upsert = new InMemoryWarehouseEntityUpsert();
const { logger, events } = createRecordingBackfillLogger();

const scope = {
  marketplaceType: "wildberries",
  companyId: "10",
  marketplaceAccountId: "100",
};

const engine = new HistoricalBackfillEngine({
  adapter: new MockMarketplaceAdapter(),
  upsert,
  checkpoints: new WarehouseCheckpointService(cpRepo),
  sessions: new WarehouseSyncSessionService(sessionRepo),
  rawMetadata: rawRepo,
  logger,
});

const result1 = await engine.run({
  scope,
  historyFrom: "2026-01-01",
  historyTo: "2026-01-15",
  trigger: "lifecycle",
  windowDays: 7,
});

check("Sync session created", Boolean(result1.sessionId));
check("Backfill status success", result1.status === "success");
check("Incremental eligible after completion", result1.eligibility.eligible === true);
check(
  "Completion log emitted",
  events.some((e) => e.event === "completion")
);

const session1 = await sessionRepo.getById(result1.sessionId);
check("Session finished success", session1?.status === "success" && Boolean(session1.finishedAt));
check(
  "Session tracks current entity / progress",
  session1?.meta?.kind === "historical_backfill_run" &&
    Number(session1?.meta?.progressPercent) === 100
);

const cps = await cpRepo.listByAccount("100");
check(
  "All 6 entity checkpoints complete",
  HISTORICAL_BACKFILL_ENTITY_ORDER.every((entity) =>
    cps.some((c) => c.entity === entity && c.mode === "historical_backfill" && c.status === "complete")
  )
);

const entityStartOrder = events
  .filter((e) => e.event === "entity_start")
  .map((e) => e.payload.entity);
check(
  "Entity order respected",
  entityStartOrder.join(",") === HISTORICAL_BACKFILL_ENTITY_ORDER.join(",")
);

const productCount = upsert.count("products");
check("Products upserted", productCount === 3, `count=${productCount}`);

// --- Idempotent second run ---
const result2 = await engine.run({
  scope,
  historyFrom: "2026-01-01",
  historyTo: "2026-01-15",
  trigger: "lifecycle",
  windowDays: 7,
});
check("Second run success (idempotent)", result2.status === "success");
check(
  "No duplicate products after replay",
  upsert.count("products") === 3
);
check(
  "Eligibility remains true",
  evaluateIncrementalEligibility(await cpRepo.listByAccount("100"), "100").eligible
);

// --- Failure stops later entities ---
const cpRepoFail = new InMemoryWarehouseCheckpointRepository();
const sessionRepoFail = new InMemoryWarehouseSyncSessionRepository();
const upsertFail = new InMemoryWarehouseEntityUpsert();
const failEngine = new HistoricalBackfillEngine({
  adapter: new MockMarketplaceAdapter({ failOnEntity: "sales" }),
  upsert: upsertFail,
  checkpoints: new WarehouseCheckpointService(cpRepoFail),
  sessions: new WarehouseSyncSessionService(sessionRepoFail),
});

const failResult = await failEngine.run({
  scope: { ...scope, marketplaceAccountId: "200" },
  historyFrom: "2026-01-01",
  historyTo: "2026-01-07",
  trigger: "lifecycle",
  windowDays: 7,
});

check("Failed backfill status", failResult.status === "failed");
check("Failed entity is sales", failResult.currentEntity === "sales");
const failCps = await cpRepoFail.listByAccount("200");
check(
  "Products complete before failure",
  failCps.some((c) => c.entity === "products" && c.status === "complete")
);
check(
  "Sales checkpoint failed",
  failCps.some((c) => c.entity === "sales" && c.status === "failed")
);
check(
  "Later entities not complete",
  !failCps.some((c) => c.entity === "finance" && c.status === "complete") &&
    !failCps.some((c) => c.entity === "prices" && c.status === "complete")
);
check(
  "Incremental not eligible after failure",
  failResult.eligibility.eligible === false
);

// --- Resume from checkpoint ---
const resumeEngine = new HistoricalBackfillEngine({
  adapter: new MockMarketplaceAdapter(),
  upsert: upsertFail,
  checkpoints: new WarehouseCheckpointService(cpRepoFail),
  sessions: new WarehouseSyncSessionService(sessionRepoFail),
});
const resumeResult = await resumeEngine.run({
  scope: { ...scope, marketplaceAccountId: "200" },
  historyFrom: "2026-01-01",
  historyTo: "2026-01-07",
  trigger: "lifecycle",
  windowDays: 7,
});
check("Resume succeeds", resumeResult.status === "success");
check("Resume flagged", resumeResult.resumed === true);
check(
  "Resume enables incremental",
  resumeResult.eligibility.eligible === true
);

// --- Rebuild history force restart ---
const rebuild = await resumeEngine.run({
  scope: { ...scope, marketplaceAccountId: "200" },
  historyFrom: "2026-01-01",
  historyTo: "2026-01-07",
  trigger: "rebuild_history",
  forceRestart: true,
  windowDays: 7,
});
check("Rebuild history success", rebuild.status === "success");

// Dashboard / reporting untouched
const dashTouched = walkTsFiles(resolve(process.cwd(), "src/components/dashboard")).some((f) =>
  readFileSync(f, "utf8").includes("HistoricalBackfillEngine")
);
const reportingTouched = walkTsFiles(resolve(process.cwd(), "src/lib/reporting")).some((f) =>
  readFileSync(f, "utf8").includes("HistoricalBackfillEngine")
);
check("Dashboard not modified for backfill engine", !dashTouched);
check("Reporting not modified for backfill engine", !reportingTouched);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
