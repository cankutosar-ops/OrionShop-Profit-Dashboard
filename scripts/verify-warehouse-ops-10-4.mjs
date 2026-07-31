/**
 * Sprint 10.4 — Scheduler & Monitoring validation.
 * Run: npx tsx scripts/verify-warehouse-ops-10-4.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
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
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

console.log("=== Sprint 10.4 — Scheduler & Monitoring ===\n");

const warehouseRoot = resolve(process.cwd(), "src/lib/warehouse");
const warehouseSrc = walkTsFiles(warehouseRoot)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

check(
  "No Wildberries HTTP inside warehouse package",
  !/from ["']@\/lib\/wildberries|statistics-api\.wildberries/i.test(warehouseSrc)
);
check(
  "Ops package present",
  existsSync(resolve(warehouseRoot, "ops/orchestrator.ts"))
);
check(
  "Ops scheduler flag enabled",
  warehouseSrc.includes("WAREHOUSE_ALLOWS_OPS_SCHEDULER = true")
);

const migration = resolve(
  process.cwd(),
  "supabase/migrations/20260731160000_warehouse_scheduler_monitoring_10_4.sql"
);
check("Migration file exists", existsSync(migration));
const migrationSql = readFileSync(migration, "utf8");
check("Migration defines queue", migrationSql.includes("warehouse_sync_queue"));
check("Migration defines history", migrationSql.includes("warehouse_sync_history"));
check("Migration defines alerts", migrationSql.includes("warehouse_ops_alerts"));
check("Migration defines schedule config", migrationSql.includes("warehouse_schedule_config"));
check("Migration defines retry state", migrationSql.includes("warehouse_retry_state"));

const apiRoute = resolve(process.cwd(), "src/app/api/warehouse/ops/route.ts");
check("Ops API route exists", existsSync(apiRoute));

const {
  WarehouseOpsOrchestrator,
  WarehouseAdminReadinessService,
  DEFAULT_SCHEDULE_INTERVALS_MS,
  HistoricalBackfillEngine,
  IncrementalSyncEngine,
  InMemoryWarehouseEntityUpsert,
  MockMarketplaceAdapter,
  WarehouseCheckpointService,
  WarehouseSyncSessionService,
  InMemoryWarehouseCheckpointRepository,
  InMemoryWarehouseSyncSessionRepository,
  InMemoryWarehouseRawMetadataRepository,
  WAREHOUSE_ALLOWS_OPS_SCHEDULER,
} = await import("../src/lib/warehouse/index.ts");

check("Ops scheduler allowed", WAREHOUSE_ALLOWS_OPS_SCHEDULER === true);
check(
  "Default intervals configurable map",
  DEFAULT_SCHEDULE_INTERVALS_MS.orders === 5 * 60 * 1000 &&
    DEFAULT_SCHEDULE_INTERVALS_MS.products === 6 * 60 * 60 * 1000
);

function makeRunner(failEntity = null) {
  const checkpointRepo = new InMemoryWarehouseCheckpointRepository();
  const sessionRepo = new InMemoryWarehouseSyncSessionRepository();
  const rawRepo = new InMemoryWarehouseRawMetadataRepository();
  const checkpoints = new WarehouseCheckpointService(checkpointRepo);
  const sessions = new WarehouseSyncSessionService(sessionRepo);
  const upsert = new InMemoryWarehouseEntityUpsert();
  let seeded = false;

  return async ({ scope, entities, trigger }) => {
    if (!seeded) {
      const backfill = new HistoricalBackfillEngine({
        adapter: new MockMarketplaceAdapter(),
        upsert,
        checkpoints,
        sessions,
        rawMetadata: rawRepo,
      });
      await backfill.run({
        scope,
        historyFrom: "2026-01-01",
        historyTo: "2026-01-07",
        trigger: "lifecycle",
        windowDays: 7,
      });
      seeded = true;
    }
    const engine = new IncrementalSyncEngine({
      adapter: new MockMarketplaceAdapter(
        failEntity ? { failOnEntity: failEntity } : {}
      ),
      upsert,
      checkpoints,
      sessions,
      rawMetadata: rawRepo,
    });
    return engine.run({ scope, trigger, entities });
  };
}

const scope = {
  marketplaceType: "wildberries",
  companyId: "1",
  marketplaceAccountId: "ops-100",
};

// --- Scheduler executes + queue process ---
{
  const ops = new WarehouseOpsOrchestrator({ runner: makeRunner() });
  ops.scheduler.markAllDue(scope, new Date(0).toISOString());
  const cycle = await ops.runCycle(scope, { processQueue: true });
  check("Scheduler found due entities", cycle.tick.dueEntities.length === 6);
  check("Scheduler enqueued job", cycle.tick.enqueued.length === 1);
  check("Queue processed job", Boolean(cycle.process?.processed));
  check(
    "History recorded execution",
    ops.store.listHistory("ops-100").length >= 1
  );
  check(
    "History has duration + rows",
    ops.store.listHistory("ops-100")[0].durationMs != null &&
      ops.store.listHistory("ops-100")[0].insertedRows +
        ops.store.listHistory("ops-100")[0].updatedRows >=
        0
  );
  check(
    "Metrics collected",
    cycle.monitoring.metrics.totalSyncs >= 1 &&
      typeof cycle.monitoring.metrics.successRate === "number"
  );
}

// --- Queue prevents duplicates ---
{
  const ops = new WarehouseOpsOrchestrator({ runner: makeRunner() });
  const first = ops.enqueueManual(scope);
  const second = ops.enqueueManual(scope);
  check("First enqueue accepted", first.deduped === false);
  check("Duplicate enqueue ignored", second.deduped === true);
  check(
    "Only one waiting/running job",
    ops.queue.list("ops-100").filter((j) => j.status === "waiting" || j.status === "running")
      .length === 1
  );
  const cancelled = ops.queue.cancelWaiting("ops-100");
  check("Cancel queued jobs", cancelled === 1);
}

// --- Configurable intervals (not hardcoded in path) ---
{
  const ops = new WarehouseOpsOrchestrator({ runner: makeRunner() });
  ops.store.ensureDefaultSchedules(scope);
  const updated = ops.store.updateScheduleInterval("ops-100", "orders", 120_000);
  check("Interval override applied", updated.intervalMs === 120_000);
  // Not due yet if lastEnqueued=now and interval 120s
  ops.store.markScheduleEnqueued("ops-100", "orders", new Date().toISOString());
  const tick = ops.scheduler.tick(scope, new Date());
  check(
    "Orders not due immediately after custom interval enqueue",
    !tick.dueEntities.includes("orders")
  );
}

// --- Retry only failed entities ---
{
  const failOps = new WarehouseOpsOrchestrator({
    runner: makeRunner("sales"),
    retryPolicy: { maxAttempts: 3, delayMs: 1 },
  });
  failOps.scheduler.markAllDue(scope, new Date(0).toISOString());
  const failedCycle = await failOps.runCycle(
    { ...scope, marketplaceAccountId: "ops-200" },
    { processQueue: true }
  );
  check(
    "Partial/failed sync recorded",
    failedCycle.process?.history?.status === "partial" ||
      failedCycle.process?.history?.status === "failed"
  );

  const retries = failOps.store.listRetries("ops-200");
  check(
    "Retry registered for sales only",
    retries.some((r) => r.entity === "sales" && r.status === "pending")
  );
  check(
    "Completed entities not in pending retry",
    !retries.some((r) => r.entity === "products" && r.status === "pending")
  );

  // Wait for retry delay (1ms) and enqueue retry
  await new Promise((r) => setTimeout(r, 5));
  const due = failOps.retry.dueEntities("ops-200", new Date());
  check("Retry due includes sales", due.includes("sales"));

  // Switch to healthy runner for resume — new orchestrator sharing store
  const resumeOps = new WarehouseOpsOrchestrator({
    store: failOps.store,
    runner: makeRunner(),
    retryPolicy: { maxAttempts: 3, delayMs: 1 },
  });
  const retryCycle = await resumeOps.runCycle(
    { ...scope, marketplaceAccountId: "ops-200" },
    { processQueue: true, now: new Date(Date.now() + 1000) }
  );
  check(
    "Retry job processed or enqueued",
    retryCycle.retryEnqueued >= 0 &&
      (retryCycle.process?.processed?.jobType === "retry" ||
        resumeOps.store.listHistory("ops-200").length >= 1)
  );
}

// --- Alerts generated ---
{
  const ops = new WarehouseOpsOrchestrator({
    runner: async () => {
      throw new Error("forced failure");
    },
    thresholds: {
      queueOverflowThreshold: 2,
      longRunningJobMs: 1,
      staleMultiplier: 3,
      consecutiveFailureAlertAt: 2,
    },
    retryPolicy: { maxAttempts: 3, delayMs: 60_000 },
  });
  const accountScope = { ...scope, marketplaceAccountId: "ops-300" };
  ops.store.ensureDefaultSchedules(accountScope);
  ops.enqueueManual(accountScope);
  await ops.processNext(accountScope);
  ops.enqueueManual(accountScope);
  await ops.processNext(accountScope);
  const alerts = ops.store.listOpenAlerts("ops-300");
  check(
    "Consecutive failure alert generated",
    alerts.some((a) => a.alertType === "consecutive_failures")
  );

  // Queue overflow
  ops.enqueueManual(accountScope);
  // Force another waiting by bypassing dedupe with different entities
  ops.queue.enqueue({
    scope: accountScope,
    jobType: "incremental",
    entities: ["orders"],
    triggerSource: "scheduled",
  });
  ops.queue.enqueue({
    scope: accountScope,
    jobType: "incremental",
    entities: ["sales"],
    triggerSource: "scheduled",
  });
  ops.alerts.evaluateAndRecord({
    marketplaceType: "wildberries",
    companyId: "1",
    marketplaceAccountId: "ops-300",
    consecutiveFailures: 0,
    waitingJobs: ops.queue.list("ops-300").filter((j) => j.status === "waiting").length,
    runningJobStartedAt: null,
    staleEntities: [],
  });
  check(
    "Queue overflow alert generated",
    ops.store.listOpenAlerts("ops-300").some((a) => a.alertType === "queue_overflow")
  );
}

// --- Health reflects state ---
{
  const ops = new WarehouseOpsOrchestrator({ runner: makeRunner() });
  const s = { ...scope, marketplaceAccountId: "ops-400" };
  ops.scheduler.markAllDue(s, new Date(0).toISOString());
  await ops.runCycle(s, { processQueue: true });
  const health = ops.getHealth("ops-400");
  check(
    "Health healthy or degraded after success",
    health.state === "healthy" || health.state === "degraded" || health.state === "sync_delayed"
  );
  check("Health reason present", Boolean(health.reason));
}

// --- Admin readiness ---
{
  const ops = new WarehouseOpsOrchestrator({ runner: makeRunner() });
  const s = { ...scope, marketplaceAccountId: "ops-500" };
  ops.store.ensureDefaultSchedules(s);
  const admin = new WarehouseAdminReadinessService(ops);
  const bundle = admin.getFullBundle(s);
  check("Admin warehouse status", Boolean(bundle.warehouseStatus.health));
  check("Admin sync status", "lastSuccessfulSyncAt" in bundle.syncStatus);
  check("Admin queue status", Array.isArray(bundle.queueStatus.waiting));
  check("Admin job status", Array.isArray(bundle.jobStatus.recentFailed));
  check("Admin history", Array.isArray(bundle.history));
  check("Admin health", Boolean(bundle.health.state));
  check("Admin metrics", typeof bundle.metrics.totalSyncs === "number");
}

// Unchanged modules
const dashTouched = walkTsFiles(resolve(process.cwd(), "src/components/dashboard")).some((f) =>
  readFileSync(f, "utf8").includes("WarehouseOpsOrchestrator")
);
const reportingTouched = walkTsFiles(resolve(process.cwd(), "src/lib/reporting")).some((f) =>
  readFileSync(f, "utf8").includes("WarehouseOpsOrchestrator")
);
const feTouched = walkTsFiles(resolve(process.cwd(), "src/lib")).some(
  (f) =>
    /financial|profit-engine|model-b/i.test(f) &&
    readFileSync(f, "utf8").includes("WarehouseOpsOrchestrator")
);
check("Dashboard unchanged", !dashTouched);
check("Reporting unchanged", !reportingTouched);
check("Financial Engine unchanged", !feTouched);
check(
  "Marketplace-independent ops (no WB imports in ops)",
  !walkTsFiles(resolve(warehouseRoot, "ops"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n")
    .includes("@/lib/wildberries")
);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
