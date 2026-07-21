import type {
  BusinessExecutiveSummaryData,
  BusinessProductSummaryData,
} from "@/lib/reports/report-engine-types";
import { formatCurrency, formatPercent } from "@/lib/utils";

type PriorSnapshot = Pick<
  BusinessExecutiveSummaryData,
  "revenue" | "netProfit" | "conversionRate" | "returnRate"
>;

/**
 * Rule-based factual observations from existing report section values.
 * Presentation only — no AI, no predictions, no new business formulas.
 */
export function buildExecutiveInsights(input: {
  current: BusinessExecutiveSummaryData;
  prior: PriorSnapshot | null;
  product: BusinessProductSummaryData | null;
  currency: string;
}): string[] {
  const insights: string[] = [];
  const { current, prior, product, currency } = input;

  if (prior) {
    if (current.revenue > prior.revenue) {
      insights.push(
        `Revenue increased compared with the previous period (${formatCurrency(prior.revenue, currency)} → ${formatCurrency(current.revenue, currency)}).`
      );
    } else if (current.revenue < prior.revenue) {
      insights.push(
        `Revenue decreased compared with the previous period (${formatCurrency(prior.revenue, currency)} → ${formatCurrency(current.revenue, currency)}).`
      );
    } else {
      insights.push("Revenue was unchanged versus the previous period.");
    }

    const conversionDelta = Math.abs(current.conversionRate - prior.conversionRate);
    if (conversionDelta < 1) {
      insights.push(
        `Conversion remained stable (${formatPercent(prior.conversionRate)} → ${formatPercent(current.conversionRate)}).`
      );
    } else if (current.conversionRate > prior.conversionRate) {
      insights.push(
        `Conversion improved (${formatPercent(prior.conversionRate)} → ${formatPercent(current.conversionRate)}).`
      );
    } else {
      insights.push(
        `Conversion declined (${formatPercent(prior.conversionRate)} → ${formatPercent(current.conversionRate)}).`
      );
    }

    if (current.returnRate < prior.returnRate) {
      insights.push(
        `Return rate improved (${formatPercent(prior.returnRate)} → ${formatPercent(current.returnRate)}).`
      );
    } else if (current.returnRate > prior.returnRate) {
      insights.push(
        `Return rate increased (${formatPercent(prior.returnRate)} → ${formatPercent(current.returnRate)}).`
      );
    }
  }

  const top = product?.topRevenue[0];
  if (top && current.revenue > 0) {
    const share = (top.value / current.revenue) * 100;
    insights.push(
      `Top product ${top.sku} generated ${share.toFixed(0)}% of revenue.`
    );
  }

  const topProfit = product?.topProfit[0];
  if (topProfit) {
    insights.push(
      `Highest profit product in period: ${topProfit.sku} (${formatCurrency(topProfit.value, currency)}).`
    );
  }

  if (product?.bestSellingBrand) {
    insights.push(
      `Best-selling brand by revenue: ${product.bestSellingBrand.name} (${formatCurrency(product.bestSellingBrand.revenue, currency)}).`
    );
  }

  return insights;
}

/** Adjacent prior period with the same length — for comparison insights only. */
export function buildPriorPeriodScope(scope: {
  from: string;
  to: string;
  marketplaceAccountId: string;
  companyId: string;
  brandId?: string;
}) {
  const from = new Date(`${scope.from}T00:00:00Z`);
  const to = new Date(`${scope.to}T00:00:00Z`);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((to.getTime() - from.getTime()) / dayMs) + 1;
  const priorTo = new Date(from.getTime() - dayMs);
  const priorFrom = new Date(priorTo.getTime() - (days - 1) * dayMs);

  return {
    ...scope,
    from: priorFrom.toISOString().slice(0, 10),
    to: priorTo.toISOString().slice(0, 10),
  };
}
