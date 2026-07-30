/**
 * Inventory Summary — stock health from inventory module in ReportContext.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";

export type InventorySectionData = {
  available: boolean;
  /** Monetary inventory value — not provided by current inventory services. */
  inventoryValue: number | null;
  activeProducts: number;
  outOfStock: number;
  lowStock: number;
  healthy: number;
  modelCount: number;
  /** Not available from current inventory module. */
  inventoryTurnover: number | null;
  accountLastSync: string | null;
  accountSyncStatus: string | null;
  models: Array<{
    productId: string;
    supplierArticle: string;
    productName: string;
    currentStock: number;
    daysLeft: number | null;
    status: string;
  }>;
  notes: string[];
};

export function buildInventorySection(
  ctx: ReportContext
): ReportSection<InventorySectionData> {
  const inv = ctx.inventory;
  const activeProducts = ctx.products.filter(
    (p) => p.unitsSold > 0 || p.revenue > 0
  ).length;

  if (!inv) {
    return {
      id: "inventory",
      kind: "inventory",
      title: "Inventory Summary",
      description: "Inventory metrics unavailable for this context",
      data: {
        available: false,
        inventoryValue: null,
        activeProducts,
        outOfStock: 0,
        lowStock: 0,
        healthy: 0,
        modelCount: 0,
        inventoryTurnover: null,
        accountLastSync: null,
        accountSyncStatus: null,
        models: [],
        notes: [
          "Inventory report unavailable.",
          "Monetary Inventory Value is not exposed by current inventory services.",
          "Inventory Turnover is not available from current inventory services.",
        ],
      },
    };
  }

  let outOfStock = 0;
  let lowStock = 0;
  let healthy = 0;
  for (const m of inv.models) {
    if (m.status === "Out of Stock") outOfStock += 1;
    else if (m.status === "Low Stock") lowStock += 1;
    else healthy += 1;
  }

  return {
    id: "inventory",
    kind: "inventory",
    title: "Inventory Summary",
    description: "Current stock status (Live State) from inventory module",
    data: {
      available: true,
      inventoryValue: null,
      activeProducts,
      outOfStock,
      lowStock,
      healthy,
      modelCount: inv.models.length,
      inventoryTurnover: null,
      accountLastSync: inv.accountLastSync,
      accountSyncStatus: inv.accountSyncStatus,
      models: inv.models.map((m) => ({
        productId: m.productId,
        supplierArticle: m.supplierArticle,
        productName: m.productName,
        currentStock: m.currentStock,
        daysLeft: m.daysLeft,
        status: m.status,
      })),
      notes: [
        "Monetary Inventory Value is not exposed by current inventory services.",
        "Inventory Turnover is not available from current inventory services.",
      ],
    },
  };
}
