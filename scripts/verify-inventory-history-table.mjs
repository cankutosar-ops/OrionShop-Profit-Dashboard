#!/usr/bin/env node
/**
 * Quick unit checks for Inventory History pivot grouping (Sprint 11.2).
 */
import assert from "assert";
import {
  DEFAULT_HISTORY_TABLE_SETTINGS,
  displaySizeLabel,
  isInternalSizeId,
  isTransitAvailableForSnapshot,
  buildVisibleExportColumns,
  pivotHistoryRows,
} from "../src/lib/inventory-history-table.ts";

assert.equal(isInternalSizeId("328154136"), true);
assert.equal(isInternalSizeId("XL"), false);
assert.equal(displaySizeLabel("328154136"), "");
assert.equal(displaySizeLabel("M"), "M");

const sample = [
  {
    brand: "Acme",
    subject: "Tees",
    seller_article: "TEE-1",
    barcode: "111",
    size: "M",
    warehouse_name: "Aktobe",
    quantity: 2,
    in_way_to_client: 1,
    in_way_from_client: 0,
  },
  {
    brand: "Acme",
    subject: "Tees",
    seller_article: "TEE-1",
    barcode: "222",
    size: "L",
    warehouse_name: "Aktobe",
    quantity: 3,
    in_way_to_client: 0,
    in_way_from_client: 1,
  },
  {
    brand: "Acme",
    subject: "Tees",
    seller_article: "TEE-1",
    barcode: "111",
    size: "M",
    warehouse_name: "Astana",
    quantity: 4,
    in_way_to_client: 0,
    in_way_from_client: 0,
  },
];

const full = pivotHistoryRows(sample, DEFAULT_HISTORY_TABLE_SETTINGS);
assert.equal(full.pivotRows.length, 2, "size-level rows");
assert.equal(full.warehouses.length, 2);

const hideSize = pivotHistoryRows(sample, {
  ...DEFAULT_HISTORY_TABLE_SETTINGS,
  size: false,
  barcode: false,
});
assert.equal(hideSize.pivotRows.length, 1, "model aggregate");
assert.equal(hideSize.pivotRows[0].total, 9);
assert.equal(hideSize.pivotRows[0].toCustomer, 1);
assert.equal(hideSize.pivotRows[0].fromCustomer, 1);
assert.equal(hideSize.pivotRows[0].byWarehouse.Aktobe, 5);
assert.equal(hideSize.pivotRows[0].byWarehouse.Astana, 4);

const hideModel = pivotHistoryRows(sample, {
  ...DEFAULT_HISTORY_TABLE_SETTINGS,
  size: false,
  model: false,
  barcode: false,
});
assert.equal(hideModel.pivotRows.length, 1);
assert.equal(hideModel.pivotRows[0].category, "Tees");
assert.equal(hideModel.pivotRows[0].model, "");

assert.equal(
  isTransitAvailableForSnapshot([
    { barcode: "", in_way_to_client: 0, in_way_from_client: 0 },
  ]),
  false,
  "CSV-like rows: transit unavailable"
);
assert.equal(
  isTransitAvailableForSnapshot([
    { barcode: "046", in_way_to_client: 0, in_way_from_client: 0 },
  ]),
  true,
  "Analytics barcode present: transit available"
);

const latestExport = buildVisibleExportColumns(
  DEFAULT_HISTORY_TABLE_SETTINGS,
  ["Aktobe"],
  (n) => n,
  { includeTransitColumns: true }
);
assert.ok(latestExport.some((c) => c.header === "To Customer"));
assert.ok(latestExport.some((c) => c.header === "From Customer"));

const historicalExport = buildVisibleExportColumns(
  DEFAULT_HISTORY_TABLE_SETTINGS,
  ["Aktobe"],
  (n) => n,
  { includeTransitColumns: false }
);
assert.equal(
  historicalExport.some((c) => c.header === "To Customer"),
  false,
  "historical export omits To Customer"
);
assert.equal(
  historicalExport.some((c) => c.header === "From Customer"),
  false,
  "historical export omits From Customer"
);

console.log("inventory-history-table checks OK");
