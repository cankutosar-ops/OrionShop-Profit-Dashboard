/**
 * Marketplace Intelligence — decision-focused ReportDocument.
 *
 * ReportContext → section data → Executive Rule Engine → ReportDocument
 * No Financial Engine changes. Rules consume section metrics only.
 */
import {
  loadReportContext,
  type LoadReportContextOptions,
  type ReportContext,
} from "@/lib/reporting/report-context";
import { buildReportDocument } from "@/lib/reporting/report-builder";
import { MARKETPLACE_INTELLIGENCE_VERSION } from "@/lib/reporting/marketplace-intelligence-version";
import { runExecutiveRuleEngine } from "@/lib/reporting/executive-rule-engine";
import { buildCategoryIntelligenceSection } from "@/lib/reporting/sections/category-intelligence";
import { buildInventorySection } from "@/lib/reporting/sections/inventory";
import { buildMarketplaceCostsSection } from "@/lib/reporting/sections/marketplace-costs";
import { buildMarketplaceExecutiveInsightsSection } from "@/lib/reporting/sections/marketplace-executive-insights";
import { buildMarketplaceRoadmapSection } from "@/lib/reporting/sections/marketplace-roadmap";
import { buildProductEngagementSection } from "@/lib/reporting/sections/product-engagement";
import { buildProductInsightsSection } from "@/lib/reporting/sections/product-insights";
import {
  buildEmptyWarehouseIntelligenceSection,
  buildWarehouseIntelligenceSection,
} from "@/lib/reporting/sections/warehouse-intelligence";
import { emptyReportInsights, netMarginPercent } from "@/lib/reporting/section-utils";
import type { ReportDocument, ReportSummary } from "@/lib/reporting/types";
import type { ScopedDateRange } from "@/types/database";
import { getWarehouseSalesAnalytics } from "@/services/warehouse-sales-analytics-service";

export { MARKETPLACE_INTELLIGENCE_VERSION } from "@/lib/reporting/marketplace-intelligence-version";

function buildMarketplaceSummary(ctx: ReportContext): ReportSummary {
  const fe = ctx.financialEngine;
  const op = ctx.overview.ordersPurchases;

  return {
    headline: "Marketplace Intelligence for the selected Report Scope",
    metrics: [
      {
        id: "revenue",
        label: "Revenue",
        value: fe.revenue,
        format: "currency",
        unit: ctx.tenant.currency,
      },
      {
        id: "net-profit",
        label: "Net Profit",
        value: fe.finalNetProfit,
        format: "currency",
        unit: ctx.tenant.currency,
      },
      {
        id: "margin",
        label: "Margin",
        value: netMarginPercent(fe.revenue, fe.finalNetProfit),
        format: "percent",
      },
      {
        id: "orders",
        label: "Orders",
        value: op.ordersCount,
        format: "number",
      },
    ],
    notes: [
      "Executive Recommendations are produced by the deterministic Rule Engine.",
      "Favorites / Cart require Sales Funnel — marked Coming Soon.",
    ],
  };
}

export function buildMarketplaceIntelligenceDocument(
  ctx: ReportContext,
  warehouse:
    | {
        ok: true;
        rows: Parameters<typeof buildWarehouseIntelligenceSection>[0]["rows"];
        totals: Parameters<typeof buildWarehouseIntelligenceSection>[0]["totals"];
      }
    | { ok: false; reason: string }
): ReportDocument {
  const categories = buildCategoryIntelligenceSection(ctx);
  const costs = buildMarketplaceCostsSection(ctx);
  const products = buildProductInsightsSection(ctx);
  const inventory = buildInventorySection(ctx);
  const warehouses = warehouse.ok
    ? buildWarehouseIntelligenceSection({
        rows: warehouse.rows,
        totals: warehouse.totals,
      })
    : buildEmptyWarehouseIntelligenceSection(warehouse.reason);

  const productProfitTotal = ctx.products.reduce(
    (sum, p) => sum + p.finalNetProfit,
    0
  );

  const ruleResult = runExecutiveRuleEngine({
    currency: ctx.tenant.currency,
    profitability: {
      revenue: ctx.financialEngine.revenue,
      netProfit: ctx.financialEngine.finalNetProfit,
      marginPercent: netMarginPercent(
        ctx.financialEngine.revenue,
        ctx.financialEngine.finalNetProfit
      ),
    },
    brands: ctx.brands,
    categories: categories.data,
    products: products.data,
    productProfitTotal,
    warehouses: warehouses.data,
    costs: costs.data,
    inventory: inventory.data,
  });

  const recommendations = buildMarketplaceExecutiveInsightsSection(ruleResult);

  return buildReportDocument({
    kind: "marketplace",
    context: ctx,
    version: MARKETPLACE_INTELLIGENCE_VERSION,
    summary: buildMarketplaceSummary(ctx),
    insights: emptyReportInsights(),
    sections: [
      recommendations,
      categories,
      products,
      warehouses,
      buildProductEngagementSection(),
      costs,
      inventory,
      buildMarketplaceRoadmapSection(),
    ],
    appendix: {
      definitions: [
        {
          term: "Executive Rule Engine",
          definition:
            "Deterministic, auditable business rules that convert ReportDocument metrics into management recommendations. Not AI.",
        },
        {
          term: "Contribution %",
          definition:
            "Category or warehouse share of period total (profit for categories/products, revenue for warehouses).",
        },
      ],
      sourceNotes: [
        "Recommendations are produced by Executive Rule Engine V1 from existing section metrics.",
        "Category and product boards aggregate Financial Engine V4 product rows.",
        "Warehouse Intelligence uses getWarehouseSalesAnalytics (completed sales with warehouse).",
        "Product Engagement awaits Wildberries Sales Funnel Analytics.",
      ],
      warnings: [
        `executive_rule_engine_v${ruleResult.engineVersion}: fired ${ruleResult.firedRuleIds.length}/${ruleResult.evaluatedRuleIds.length} rules`,
      ],
    },
  });
}

/**
 * Load ReportContext + warehouse sales, then compose Marketplace Intelligence.
 */
export async function buildMarketplaceIntelligence(
  scope: ScopedDateRange,
  options: LoadReportContextOptions = {}
): Promise<ReportDocument> {
  const [ctx, warehouseResult] = await Promise.all([
    loadReportContext(scope, options),
    getWarehouseSalesAnalytics(scope).then(
      (report) => {
        if (!report) {
          return {
            ok: false as const,
            reason:
              "Warehouse sales analytics returned no report for this scope.",
          };
        }
        return {
          ok: true as const,
          rows: report.rows,
          totals: report.totals,
        };
      },
      (err: unknown) =>
        ({
          ok: false as const,
          reason:
            err instanceof Error
              ? err.message
              : "Warehouse sales analytics unavailable for this scope.",
        }) as const
    ),
  ]);

  return buildMarketplaceIntelligenceDocument(ctx, warehouseResult);
}
