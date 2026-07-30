/**
 * Warehouse Intelligence — existing warehouse sales analytics only.
 * Inventory value by warehouse is not exposed by current services.
 */
import type { ReportSection } from "@/lib/reporting/types";
import type {
  WarehouseSalesRow,
  WarehouseSalesTotals,
} from "@/lib/warehouse-sales-analytics";

export type WarehouseIntelligenceRow = {
  warehouse: string;
  orders: number;
  unitsSold: number;
  revenue: number;
  orderSharePercent: number;
  revenueSharePercent: number;
  /** Contribution to account warehouse revenue (same as revenueSharePercent). */
  contributionPercent: number;
};

export type WarehouseIntelligenceData = {
  available: boolean;
  totals: {
    warehouseCount: number;
    orders: number;
    unitsSold: number;
    revenue: number;
  };
  rows: WarehouseIntelligenceRow[];
  /** Monetary inventory value by warehouse — not available from current services. */
  inventoryValueAvailable: false;
  notes: string[];
};

export function buildWarehouseIntelligenceSection(input: {
  rows: WarehouseSalesRow[];
  totals: WarehouseSalesTotals;
}): ReportSection<WarehouseIntelligenceData> {
  const rows: WarehouseIntelligenceRow[] = [...input.rows]
    .sort((a, b) => b.revenue - a.revenue)
    .map((row) => ({
      warehouse: row.warehouse,
      orders: row.orders,
      unitsSold: row.units,
      revenue: row.revenue,
      orderSharePercent: row.orderSharePercent,
      revenueSharePercent: row.revenueSharePercent,
      contributionPercent: row.revenueSharePercent,
    }));

  const available = rows.length > 0;

  return {
    id: "warehouse-intelligence",
    kind: "warehouse-intelligence",
    title: "Warehouse Intelligence",
    description:
      "Sales and contribution by warehouse from completed Wildberries sales — no forecasting",
    data: {
      available,
      totals: {
        warehouseCount: rows.length,
        orders: input.totals.orders,
        unitsSold: input.totals.units,
        revenue: input.totals.revenue,
      },
      rows,
      inventoryValueAvailable: false,
      notes: [
        "Orders / Orders Amount from wb_orders; Units/Revenue from completed wb_sales (NULL warehouse → Unknown Warehouse).",
        "Orders Amount uses price_with_disc × quantity (fallback to list price), same as Orders Value.",
        "Revenue is Σ price_with_disc × quantity for completed sales.",
        "Inventory Value by warehouse is not exposed by current inventory services.",
        "Warehouse Contribution % = warehouse revenue ÷ total warehouse revenue.",
      ],
    },
  };
}

export function buildEmptyWarehouseIntelligenceSection(
  reason: string
): ReportSection<WarehouseIntelligenceData> {
  return {
    id: "warehouse-intelligence",
    kind: "warehouse-intelligence",
    title: "Warehouse Intelligence",
    description:
      "Sales and contribution by warehouse from completed Wildberries sales — no forecasting",
    data: {
      available: false,
      totals: {
        warehouseCount: 0,
        orders: 0,
        unitsSold: 0,
        revenue: 0,
      },
      rows: [],
      inventoryValueAvailable: false,
      notes: [
        reason,
        "Inventory Value by warehouse is not exposed by current inventory services.",
      ],
    },
  };
}
