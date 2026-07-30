/**
 * Snapshot of ReportDocument section metrics for the rule engine.
 * Rules must not call Financial Engine or invent new formulas.
 */
import type { CategoryIntelligenceData } from "@/lib/reporting/sections/category-intelligence";
import type { WarehouseIntelligenceData } from "@/lib/reporting/sections/warehouse-intelligence";
import type { MarketplaceCostsData } from "@/lib/reporting/sections/marketplace-costs";
import type { ProductInsightsData } from "@/lib/reporting/sections/product-insights";
import type { InventorySectionData } from "@/lib/reporting/sections/inventory";
import type { GroupedProfitability } from "@/types/database";

export type RuleEngineInput = {
  currency: string;
  profitability: {
    revenue: number;
    netProfit: number;
    marginPercent: number;
  };
  brands: GroupedProfitability[];
  categories: CategoryIntelligenceData;
  products: ProductInsightsData;
  /** Portfolio totals for contribution base (product net profit sum). */
  productProfitTotal: number;
  warehouses: WarehouseIntelligenceData;
  costs: MarketplaceCostsData;
  inventory: InventorySectionData | null;
};
