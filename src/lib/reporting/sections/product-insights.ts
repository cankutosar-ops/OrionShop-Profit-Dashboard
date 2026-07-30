/**
 * Product Insight boards for Marketplace Intelligence.
 * Rankings only — does not duplicate the full portfolio table.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import {
  netMarginPercent,
  rankProductsBy,
  type RankedProduct,
} from "@/lib/reporting/section-utils";

const BOARD_N = 10;

export type ProductInsightsData = {
  highestMargin: RankedProduct[];
  lowestMargin: RankedProduct[];
  highestRevenue: RankedProduct[];
  fastestSelling: RankedProduct[];
  highestReturn: RankedProduct[];
  /** Top products by Final Net Profit (for concentration / protect-stock rules). */
  topByNetProfit: RankedProduct[];
  /** Worst products by Final Net Profit (loss-maker rules). */
  worstByNetProfit: RankedProduct[];
};

export function buildProductInsightsSection(
  ctx: ReportContext
): ReportSection<ProductInsightsData> {
  const products = ctx.products;
  const withRevenue = products.filter((p) => p.revenue > 0);

  return {
    id: "product-insights",
    kind: "product-insights",
    title: "Product Intelligence",
    description:
      "Decision boards from Financial Engine product rows — not a second portfolio table",
    data: {
      highestMargin: rankProductsBy(
        withRevenue,
        (p) => netMarginPercent(p.revenue, p.finalNetProfit),
        BOARD_N
      ),
      lowestMargin: rankProductsBy(
        withRevenue,
        (p) => netMarginPercent(p.revenue, p.finalNetProfit),
        BOARD_N,
        "asc"
      ),
      highestRevenue: rankProductsBy(products, (p) => p.revenue, BOARD_N),
      fastestSelling: rankProductsBy(products, (p) => p.unitsSold, BOARD_N),
      highestReturn: rankProductsBy(products, (p) => p.returnRate, BOARD_N),
      topByNetProfit: rankProductsBy(products, (p) => p.finalNetProfit, BOARD_N),
      worstByNetProfit: rankProductsBy(
        products,
        (p) => p.finalNetProfit,
        BOARD_N,
        "asc"
      ),
    },
  };
}
