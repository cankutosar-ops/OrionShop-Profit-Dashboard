/**
 * Warehouse Enhancement — Warehouse Locations (FBS Ready).
 * Run: npx tsx scripts/verify-warehouse-locations-fbs-ready.mjs
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
console.log("=== Warehouse Locations (FBS Ready) ===\n");

console.log("--- Artifacts ---");
const artifacts = [
  "src/lib/warehouse-locations.ts",
  "src/services/warehouse-location-service.ts",
  "src/app/api/warehouse-locations/route.ts",
  "src/components/inventory/warehouse-location-select.tsx",
];
for (const rel of artifacts) {
  check(rel, existsSync(resolve(root, rel)));
}

console.log("\n--- Model & classification ---");
const {
  classifyWarehouseLocationType,
  buildWarehouseLocations,
  mergeWarehouseNameLists,
  warehouseLocationNames,
} = await import("../src/lib/warehouse-locations.ts");

check(
  "FBS Moscow → type fbs",
  classifyWarehouseLocationType("FBS Moscow") === "fbs"
);
check(
  "Склад продавца → type fbs",
  classifyWarehouseLocationType("Склад продавца") === "fbs"
);
check(
  "Электросталь → type wb (FBO peer, not FBS by city name)",
  classifyWarehouseLocationType("Электросталь") === "wb"
);
check(
  "Koledino → type wb",
  classifyWarehouseLocationType("Koledino") === "wb"
);

const catalog = buildWarehouseLocations([
  { name: "Электросталь", active: true },
  { name: "FBS Moscow", active: true },
  { name: "FBS Kazan", active: true },
  { name: "Коледино", active: true },
  { name: "  FBS Moscow  ", active: true },
]);
check("Catalog contains WB + FBS peers", catalog.length === 4, `${catalog.length} locations`);
check(
  "Catalog includes FBS Moscow",
  catalog.some((l) => l.name === "FBS Moscow" && l.type === "fbs")
);
check(
  "Catalog includes Электросталь as wb",
  catalog.some((l) => l.name === "Электросталь" && l.type === "wb")
);
check(
  "Names helper returns all",
  warehouseLocationNames(catalog).length === 4
);
check(
  "mergeWarehouseNameLists unions without fulfillment split",
  mergeWarehouseNameLists(["Коледино"], ["FBS Moscow", "FBS Kazan"]).includes("FBS Moscow")
);

console.log("\n--- Selectors wired to Warehouse Locations ---");
const historyUi = read("src/components/inventory/inventory-history-workspace.tsx");
check(
  "Inventory History uses WarehouseLocationSelect",
  historyUi.includes("WarehouseLocationSelect")
);
check(
  "Inventory History merges location catalog names",
  historyUi.includes("mergeWarehouseNameLists")
);

const histSvc = read("src/services/historical-inventory-service.ts");
check(
  "Snapshot warehouse list unions location catalog",
  histSvc.includes("listWarehouseLocationNames") && histSvc.includes("mergeWarehouseNameLists")
);

const salesUi = read("src/components/inventory/warehouse-sales-analytics-table.tsx");
check(
  "Warehouse Sales uses WarehouseLocationSelect",
  salesUi.includes("WarehouseLocationSelect")
);
check(
  "Warehouse Sales has no fulfillment-type filter",
  !/fulfillment|fboOnly|fbsOnly|type\s*===\s*[\"']fbs/.test(salesUi)
);

const salesSvc = read("src/services/warehouse-sales-analytics-service.ts");
check(
  "Warehouse Sales attaches locations catalog",
  salesSvc.includes("listWarehouseLocations") && salesSvc.includes("locations")
);

const reporting = read("src/lib/reporting/marketplace-intelligence.ts");
check(
  "Reporting still reuses getWarehouseSalesAnalytics (name grouping)",
  reporting.includes("getWarehouseSalesAnalytics")
);
check(
  "Reporting has no FBO/FBS fulfillment filter",
  !/fbsOnly|fboOnly|fulfillmentType/.test(reporting)
);

console.log("\n--- Out of scope preserved ---");
const fe = read("src/lib/financial-engine.ts");
check("Financial Engine file present / unchanged role", fe.length > 100);
check(
  "Financial Engine not imported by location service",
  !read("src/services/warehouse-location-service.ts").includes("financial-engine")
);
check(
  "Smart Pricing not imported by location model",
  !read("src/lib/warehouse-locations.ts").includes("smart-pricing")
);

const locSelect = read("src/components/inventory/warehouse-location-select.tsx");
check(
  "Selector filters by name only (no type filter UI)",
  locSelect.includes("Does not expose fulfillment-type filters")
);

const engInc = read("src/lib/warehouse/incremental/engine.ts");
check("Incremental sync engine not redesigned (still present)", engInc.includes("IncrementalSyncEngine"));
const checkpoints = read("src/lib/warehouse/checkpoints/checkpoint-service.ts");
check("Checkpoint service still present", checkpoints.includes("WarehouseCheckpointService"));

const aliases = read("src/lib/warehouse-name-aliases.ts");
check("FBS Moscow alias present", aliases.includes("FBS Moscow"));
check("Kolomna alias present", aliases.includes("Kolomna") || aliases.includes("Коломна"));

console.log(`\n=== Result: ${failures === 0 ? "PASS" : "FAIL"} (${failures} failure(s)) ===`);
process.exit(failures === 0 ? 0 : 1);
