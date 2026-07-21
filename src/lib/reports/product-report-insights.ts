import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import { buildPortfolioConcentration } from "@/lib/reports/product-report-concentration";
import type {
  ProductReportExecutiveData,
  ProductReportPerformanceRow,
  ProductReportPortfolioData,
  ProductReportProfitabilityData,
} from "@/lib/reports/report-engine-types";

type PriorSnapshot = {
  productsWithSales: number;
  negativeProfitCount: number;
  totalRevenue: number;
  /** Optional — only when already supplied by the caller; never invented. */
  top5ProfitSharePercent?: number;
};

/**
 * Rule-based factual observations for Product Report.
 * Presentation only — no AI, no predictions, no new business formulas.
 */
export function buildProductExecutiveInsights(input: {
  executive: Omit<ProductReportExecutiveData, "insights">;
  profitability: ProductReportProfitabilityData;
  portfolio: ProductReportPortfolioData;
  performanceRows: ProductReportPerformanceRow[];
  prior: PriorSnapshot | null;
  currency: string;
}): string[] {
  const insights: string[] = [];
  const { executive, profitability, portfolio, performanceRows, prior, currency } =
    input;

  const totalRevenue = performanceRows.reduce((sum, row) => sum + row.revenue, 0);
  const totalProfit = performanceRows.reduce((sum, row) => sum + row.profit, 0);

  const top = executive.topRevenueProduct;
  if (top && totalRevenue > 0) {
    const share = (top.value / totalRevenue) * 100;
    insights.push(
      `Top product ${top.sku} generated ${share.toFixed(0)}% of revenue (${formatCurrency(top.value, currency)}).`
    );
  }

  const topFiveProfit = profitability.topProfit.slice(0, 5);
  if (topFiveProfit.length > 0 && totalProfit !== 0) {
    const fiveSum = topFiveProfit.reduce((sum, row) => sum + row.value, 0);
    const share = (fiveSum / Math.abs(totalProfit)) * 100;
    insights.push(
      `Top five products by profit accounted for ${share.toFixed(0)}% of absolute period profit (${formatCurrency(fiveSum, currency)}).`
    );
  }

  const concentration = buildPortfolioConcentration(performanceRows);
  if (concentration) {
    if (concentration.top5RevenueSharePercent >= 60) {
      insights.push(
        `Revenue is highly concentrated in a small number of products (top 5 generate ${concentration.top5RevenueSharePercent.toFixed(1)}% of total revenue).`
      );
    } else if (
      concentration.top5RevenueSharePercent > 0 &&
      concentration.top5RevenueSharePercent <= 40 &&
      performanceRows.length >= 8
    ) {
      insights.push(
        `Revenue is well diversified across the portfolio (top 5 generate ${concentration.top5RevenueSharePercent.toFixed(1)}% of total revenue).`
      );
    }

    if (
      prior?.top5ProfitSharePercent != null &&
      Number.isFinite(prior.top5ProfitSharePercent)
    ) {
      const current = concentration.top5ProfitSharePercent;
      const previous = prior.top5ProfitSharePercent;
      if (current > previous + 0.5) {
        insights.push(
          `Profit concentration increased compared to the previous period (${previous.toFixed(1)}% → ${current.toFixed(1)}% in the top 5).`
        );
      } else if (current < previous - 0.5) {
        insights.push(
          `Profit concentration decreased compared to the previous period (${previous.toFixed(1)}% → ${current.toFixed(1)}% in the top 5).`
        );
      }
    }
  }

  const negativeCount = profitability.negativeProfit.length;
  if (prior) {
    if (negativeCount > prior.negativeProfitCount) {
      insights.push(
        `Products with negative profitability increased (${prior.negativeProfitCount} → ${negativeCount}).`
      );
    } else if (negativeCount < prior.negativeProfitCount) {
      insights.push(
        `Products with negative profitability decreased (${prior.negativeProfitCount} → ${negativeCount}).`
      );
    } else {
      insights.push(
        `Products with negative profitability remained at ${negativeCount}.`
      );
    }
  } else if (negativeCount > 0) {
    insights.push(
      `${formatNumber(negativeCount)} product(s) recorded negative Final Net Profit in the period.`
    );
  }

  const topBrand = portfolio.largestBrand;
  if (topBrand && totalRevenue > 0) {
    insights.push(
      `Largest brand by revenue: ${topBrand.name} (${topBrand.revenueSharePercent.toFixed(0)}% of revenue).`
    );
  }

  const topCategory = portfolio.highestProfitCategory;
  if (topCategory) {
    insights.push(
      `Highest profit category: ${topCategory.name} (${formatCurrency(topCategory.profit, currency)}).`
    );
  }

  if (portfolio.byBrand.length > 0 && totalRevenue > 0) {
    const leader = portfolio.byBrand[0];
    if (leader.revenueSharePercent >= 50) {
      insights.push(
        `Inventory / portfolio concentration is high: ${leader.name} contributes ${leader.revenueSharePercent.toFixed(0)}% of revenue.`
      );
    } else if (leader.revenueSharePercent <= 25 && portfolio.byBrand.length >= 3) {
      insights.push(
        `Revenue concentration is low: the largest brand contributes ${leader.revenueSharePercent.toFixed(0)}% of revenue across ${formatNumber(portfolio.byBrand.length)} brands.`
      );
    }
  }

  if (executive.averageMarginPercent != null) {
    insights.push(
      `Portfolio margin (Final Net Profit ÷ Revenue) was ${formatPercent(executive.averageMarginPercent)}.`
    );
  }

  return insights;
}
