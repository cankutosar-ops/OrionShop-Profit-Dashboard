/**
 * Client-side Excel export for Inventory Intelligence (filtered rows only).
 * Totals are summed from existing warehouseDistribution — no new server calcs.
 */

import * as XLSX from "xlsx";
import type { InventoryIntelligenceSkuRow } from "@/lib/inventory-intelligence-types";
import { formatWarehouseName } from "@/lib/warehouse-name-aliases";

export type DistributionTotals = {
  orders: number;
  units: number;
  revenue: number;
};

/** Sum period metrics already present on warehouseDistribution rows. */
export function totalsFromDistribution(
  row: Pick<InventoryIntelligenceSkuRow, "warehouseDistribution">
): DistributionTotals {
  let orders = 0;
  let units = 0;
  let revenue = 0;
  for (const wh of row.warehouseDistribution) {
    orders += wh.orders;
    units += wh.unitsSold;
    revenue += wh.revenue;
  }
  return { orders, units, revenue };
}

export type IntelligenceExportMeta = {
  asOfDate: string;
  rangeFrom: string;
  rangeTo: string;
};

function buildIntelligenceSheetRows(rows: InventoryIntelligenceSkuRow[]) {
  return rows.map((row) => {
    const totals = totalsFromDistribution(row);
    return {
      SKU: row.sku,
      Product: row.productName,
      Brand: row.brandName,
      Category: row.categoryName,
      "Current Stock": row.currentStock,
      "Warehouse Count": row.warehouseCount,
      "Total Orders": totals.orders,
      "Total Units": totals.units,
      "Total Sales": Math.round(totals.revenue * 100) / 100,
      "Last Sale Date": row.lastSaleDate ?? "",
      "Days Since Last Sale": row.daysSinceLastSale ?? "",
      "Stock Health": row.stockHealth,
    };
  });
}

function buildDistributionSheetRows(rows: InventoryIntelligenceSkuRow[]) {
  const out: Array<Record<string, string | number>> = [];
  for (const row of rows) {
    for (const wh of row.warehouseDistribution) {
      out.push({
        SKU: row.sku,
        Warehouse: formatWarehouseName(wh.warehouse),
        Orders: wh.orders,
        Units: wh.unitsSold,
        Sales: Math.round(wh.revenue * 100) / 100,
        "Order Share": Math.round(wh.salesSharePercent * 100) / 100,
      });
    }
  }
  return out;
}

/** Build .xlsx ArrayBuffer for the currently filtered/sorted Intelligence rows. */
export function buildInventoryIntelligenceWorkbook(
  rows: InventoryIntelligenceSkuRow[]
): ArrayBuffer {
  const workbook = XLSX.utils.book_new();

  const sheet1 = XLSX.utils.json_to_sheet(buildIntelligenceSheetRows(rows));
  XLSX.utils.book_append_sheet(workbook, sheet1, "Inventory Intelligence");

  const sheet2 = XLSX.utils.json_to_sheet(buildDistributionSheetRows(rows));
  XLSX.utils.book_append_sheet(workbook, sheet2, "Warehouse Sales");

  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function buildInventoryIntelligenceFilename(date = new Date()): string {
  const iso = date.toISOString().split("T")[0];
  return `Inventory_Intelligence_${iso}.xlsx`;
}

/** Trigger a browser download of the workbook for the given filtered rows. */
export function downloadInventoryIntelligenceExcel(
  rows: InventoryIntelligenceSkuRow[],
  _meta?: IntelligenceExportMeta
): void {
  const buffer = buildInventoryIntelligenceWorkbook(rows);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildInventoryIntelligenceFilename();
  anchor.click();
  URL.revokeObjectURL(url);
}
