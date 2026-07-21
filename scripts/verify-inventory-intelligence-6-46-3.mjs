#!/usr/bin/env node
/**
 * Sprint 6.46.3 — Inventory Intelligence production polish checks (pure / static).
 *
 * Usage: npx tsx scripts/verify-inventory-intelligence-6-46-3.mjs
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const {
  localizeWarehouseName,
  formatWarehouseName,
  warehouseNameHasCyrillic,
  WAREHOUSE_NAME_ALIASES,
} = await import("../src/lib/warehouse-name-aliases.ts");
const { getWbProductThumbnailUrl } = await import("../src/lib/wb-product-image.ts");
const {
  totalsFromDistribution,
  buildInventoryIntelligenceWorkbook,
} = await import("../src/lib/inventory-intelligence-excel.ts");
const { summarizeProductStock } = await import("../src/lib/inventory-intelligence-aggregation.ts");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("OK:", msg);
  }
}

console.log("\n=== Sprint 6.46.3 — Inventory Intelligence Polish ===\n");

assert(
  formatWarehouseName("Электросталь") === "Elektrostal",
  "alias Электросталь → Elektrostal"
);
assert(
  formatWarehouseName("Самара (Новосемейкино)") === "Samara (Novosemeykino)",
  "alias Samara (Novosemeykino)"
);
assert(formatWarehouseName("Сарапул") === "Sarapul", "alias Сарапул");
assert(formatWarehouseName("СПБ Шушары") === "SPB Shushary", "alias СПБ Шушары");
assert(formatWarehouseName("Владимир") === "Vladimir", "alias Владимир");
assert(
  formatWarehouseName("СЦ Оренбург Центральная") === "SC Orenburg Tsentralnaya",
  "alias СЦ Оренбург Центральная"
);
assert(formatWarehouseName("Белая дача") === "Belaya Dacha", "alias Белая дача");
assert(formatWarehouseName("Обухово") === "Obukhovo", "alias Обухово");
assert(
  formatWarehouseName("Unknown Warehouse XYZ") === "Unknown Warehouse XYZ",
  "unknown Latin warehouse falls back to original"
);
assert(
  !warehouseNameHasCyrillic(formatWarehouseName("Неизвестный Склад 99")),
  "unknown Cyrillic warehouse is transliterated (no Cyrillic in UI)"
);
assert(
  formatWarehouseName === localizeWarehouseName,
  "formatWarehouseName aliases localizeWarehouseName"
);
assert(Object.keys(WAREHOUSE_NAME_ALIASES).length >= 30, "alias map is extendable (≥30)");

// Every warehouse seen in local exports must localize without Cyrillic.
const exportWarehouses = [
  "Актобе",
  "Астана Карагандинское шоссе",
  "Белая дача",
  "Владивосток",
  "Владимир",
  "Волгоград",
  "Воронеж",
  "Екатеринбург - Перспективная 14",
  "Казань",
  "Коледино",
  "Котовск",
  "Краснодар",
  "Невинномысск",
  "Обухово",
  "Пенза",
  "Рязань (Тюшевское)",
  "СК Ереван",
  "СПБ Шушары",
  "СЦ Оренбург Центральная",
  "Самара (Новосемейкино)",
  "Сарапул",
  "Тверь",
  "Тула",
  "Электросталь",
];
for (const name of exportWarehouses) {
  const latin = formatWarehouseName(name);
  assert(!warehouseNameHasCyrillic(latin), `export warehouse Latin: ${name} → ${latin}`);
}

const thumb = getWbProductThumbnailUrl(1_234_567);
assert(typeof thumb === "string" && thumb.includes("1234567"), "thumbnail URL from nm_id");
assert(getWbProductThumbnailUrl(null) === null, "null nm_id → no URL");

const sampleRow = {
  productId: "p1",
  sku: "SKU1",
  productName: "Test",
  nmId: 1,
  brandId: "b",
  brandName: "Brand",
  categoryId: "c",
  categoryName: "Cat",
  currentStock: 5,
  warehouseCount: 2,
  warehouseDistribution: [
    {
      warehouse: "Электросталь",
      orders: 2,
      unitsSold: 3,
      revenue: 100,
      salesSharePercent: 66.67,
    },
    {
      warehouse: "Коледино",
      orders: 1,
      unitsSold: 1,
      revenue: 50,
      salesSharePercent: 33.33,
    },
  ],
  lastSaleDate: "2026-07-01",
  daysSinceLastSale: 19,
  stockHealth: "Slow",
};

const totals = totalsFromDistribution(sampleRow);
assert(totals.orders === 3, "export totals orders = Σ distribution");
assert(totals.units === 4, "export totals units = Σ distribution");
assert(totals.revenue === 150, "export totals revenue = Σ distribution");

const buffer = buildInventoryIntelligenceWorkbook([sampleRow]);
assert(buffer.byteLength > 100, "xlsx workbook builds");

const stock = summarizeProductStock([
  {
    productId: "p1",
    marketplaceAccountId: "1",
    techSize: "M",
    barcode: null,
    warehouse: "Коледино",
    availableStock: 1,
    currentStock: 2,
    reservedStock: 0,
    syncedAt: null,
    nmId: null,
    supplierArticle: "SKU1",
  },
  {
    productId: "p1",
    marketplaceAccountId: "1",
    techSize: "L",
    barcode: null,
    warehouse: "Коледино",
    availableStock: 1,
    currentStock: 1,
    reservedStock: 0,
    syncedAt: null,
    nmId: null,
    supplierArticle: "SKU1",
  },
  {
    productId: "p1",
    marketplaceAccountId: "1",
    techSize: "M",
    barcode: null,
    warehouse: "Электросталь",
    availableStock: 0,
    currentStock: 3,
    reservedStock: 0,
    syncedAt: null,
    nmId: null,
    supplierArticle: "SKU1",
  },
]);
assert(stock.warehouseCount === 2, "Warehouse Count = unique stock warehouses (not size rows)");

const out = {
  sprint: "6.46.3",
  pass: failed === 0,
  failed,
  warehouseCountMeaning:
    "Distinct warehouses with current wb_stock rows (summarizeProductStock). Not sales-period distribution length.",
  generatedAt: new Date().toISOString(),
};

mkdirSync(resolve(process.cwd(), "exports"), { recursive: true });
writeFileSync(
  resolve(process.cwd(), "exports/verify-inventory-intelligence-6-46-3.json"),
  JSON.stringify(out, null, 2)
);

console.log(failed === 0 ? "\nPASS\n" : `\nFAIL (${failed})\n`);
process.exit(failed === 0 ? 0 : 1);
