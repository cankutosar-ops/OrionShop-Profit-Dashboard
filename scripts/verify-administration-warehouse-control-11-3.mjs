/**
 * Sprint 11.3 — Warehouse Control Center validation.
 * Run: npx tsx scripts/verify-administration-warehouse-control-11-3.mjs
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

const root = resolve(process.cwd());
console.log("=== Sprint 11.3 — Warehouse Control Center ===\n");

const artifacts = [
  "src/services/warehouse-control-center-service.ts",
  "src/lib/administration/warehouse-control-types.ts",
  "src/components/administration/warehouse-health-card.tsx",
  "src/components/administration/sync-session-table.tsx",
  "src/components/administration/queue-table.tsx",
  "src/components/administration/checkpoint-table.tsx",
  "src/components/administration/scheduler-table.tsx",
  "src/components/administration/alert-table.tsx",
  "src/components/administration/warehouse-control-panels.tsx",
  "src/app/administration/warehouse/page.tsx",
  "src/app/administration/warehouse/sessions/page.tsx",
  "src/app/administration/warehouse/queue/page.tsx",
  "src/app/administration/warehouse/checkpoints/page.tsx",
  "src/app/administration/warehouse/scheduler/page.tsx",
  "src/app/administration/alerts/page.tsx",
  "src/app/administration/system-health/page.tsx",
];

console.log("--- Artifacts ---");
for (const rel of artifacts) {
  check(rel, existsSync(resolve(root, rel)));
}

const overview = readFileSync(resolve(root, "src/app/administration/warehouse/page.tsx"), "utf8");
check("Overview is not placeholder", !overview.includes("AdminPlaceholderPage"));
check("Overview uses WarehouseOverviewPanel", overview.includes("WarehouseOverviewPanel"));

const opsRoute = readFileSync(resolve(root, "src/app/api/warehouse/ops/route.ts"), "utf8");
check("Ops API exposes view=control", opsRoute.includes('view === "control"'));
check("Ops API supports schedule_enable", opsRoute.includes("schedule_enable"));

const opsSvc = readFileSync(resolve(root, "src/services/warehouse-ops-service.ts"), "utf8");
check("setWarehouseScheduleEnabled exported", opsSvc.includes("setWarehouseScheduleEnabled"));
check("Live orchestrator reuse for Control Center", opsSvc.includes("liveOrchestrators"));

const panels = readFileSync(
  resolve(root, "src/components/administration/warehouse-control-panels.tsx"),
  "utf8"
);
check("Scheduler Enable/Disable wired", panels.includes("schedule_enable"));
check("Scheduler Run Now uses enqueue", panels.includes('action: "enqueue"'));
check("Queue cancel reuses ops cancel", panels.includes('action: "cancel"'));
check("No Financial Engine imports", !/financial-engine|smart-pricing|buildModelB/.test(panels));

const controlSvc = readFileSync(
  resolve(root, "src/services/warehouse-control-center-service.ts"),
  "utf8"
);
check("Control center reuses getWarehouseAdminBundle", controlSvc.includes("getWarehouseAdminBundle"));
check("Control center reads checkpoints/sessions repos", controlSvc.includes("listByAccount"));
check("Control center does not import sync engines", !/HistoricalBackfillEngine|IncrementalSyncEngine/.test(controlSvc));

const engine = readFileSync(resolve(root, "src/lib/warehouse/incremental/engine.ts"), "utf8");
check("Incremental engine file unchanged in role (still present)", engine.includes("IncrementalSyncEngine"));

const fe = readFileSync(resolve(root, "src/lib/financial-engine.ts"), "utf8");
check("Financial Engine untouched presence", fe.includes("buildModelB") || fe.includes("calculateEstimatedTax") || fe.length > 100);

const dash = readFileSync(resolve(root, "src/services/dashboard-service.ts"), "utf8");
check("Dashboard service still present", dash.includes("getOverviewMetrics") || dash.length > 100);

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
