"use client";

import type { ReportDocument } from "@/lib/reporting/types";
import type { CoverData } from "@/lib/reporting/sections/cover";
import type { ExecutiveSummaryData } from "@/lib/reporting/sections/executive-summary";
import type { FinancialSummaryData } from "@/lib/reporting/sections/financial-summary";
import type { SettlementReconciliationData } from "@/lib/reporting/sections/settlement-reconciliation";
import type { BrandProfitabilityData } from "@/lib/reporting/sections/brand-profitability";
import type { ProductPerformanceData } from "@/lib/reporting/sections/product-performance";
import type { MarketplaceCostsData } from "@/lib/reporting/sections/marketplace-costs";
import type { LogisticsData } from "@/lib/reporting/sections/logistics";
import type { ReturnsData } from "@/lib/reporting/sections/returns";
import type { FinancialRatiosData } from "@/lib/reporting/sections/financial-ratios";
import type { TrendsData } from "@/lib/reporting/sections/trends";
import type { InventorySectionData } from "@/lib/reporting/sections/inventory";
import type { ReportHealthData } from "@/lib/reporting/sections/report-health";
import type { AppendixSectionData } from "@/lib/reporting/sections/appendix";
import { findReportSection } from "@/components/reports/preview/report-section-frame";
import { WorkspaceNav } from "@/components/reports/preview/workspace-nav";
import { ExecutiveSummarySection } from "@/components/reports/preview/sections/executive-summary-section";
import { FinancialIntelligenceSection } from "@/components/reports/preview/sections/financial-intelligence-section";
import { BrandIntelligenceSection } from "@/components/reports/preview/sections/brand-intelligence-section";
import { ProductIntelligenceSection } from "@/components/reports/preview/sections/product-intelligence-section";
import { MarketplaceCostAnalysisSection } from "@/components/reports/preview/sections/marketplace-cost-analysis-section";
import { SettlementReconciliationSection } from "@/components/reports/preview/sections/settlement-reconciliation-section";
import { InventorySummarySection } from "@/components/reports/preview/sections/inventory-summary-section";
import { AppendixSectionView } from "@/components/reports/preview/sections/appendix-section";
import {
  reportMoney,
  reportNumber,
  reportPercent,
} from "@/components/reports/preview/report-format";

const WORKSPACE_NAV = [
  { id: "executive-summary", label: "1 Executive" },
  { id: "financial-intelligence", label: "2 Financial" },
  { id: "brand-intelligence", label: "3 Brands" },
  { id: "product-intelligence", label: "4 Products" },
  { id: "marketplace-costs", label: "5 Costs" },
  { id: "settlement-reconciliation", label: "6 Settlement" },
  { id: "inventory-intelligence", label: "7 Inventory" },
  { id: "appendix", label: "8 Appendix" },
] as const;

/**
 * Business Intelligence Workspace — interactive management surface over ReportDocument.
 * Presentation only: no Financial Engine / sync / calculation changes.
 * Sheet order matches the approved Workbook Blueprint.
 */
export function BusinessReportPreview({ document }: { document: ReportDocument }) {
  const currency = document.metadata.company.currency;
  const sections = document.sections;

  const cover = findReportSection<CoverData>(sections, "cover");
  const executive = findReportSection<ExecutiveSummaryData>(
    sections,
    "executive-summary"
  );
  const financial = findReportSection<FinancialSummaryData>(
    sections,
    "financial-summary"
  );
  const settlement = findReportSection<SettlementReconciliationData>(
    sections,
    "settlement-reconciliation"
  );
  const brands = findReportSection<BrandProfitabilityData>(
    sections,
    "brand-profitability"
  );
  const products = findReportSection<ProductPerformanceData>(
    sections,
    "product-performance"
  );
  const costs = findReportSection<MarketplaceCostsData>(
    sections,
    "marketplace-costs"
  );
  const logistics = findReportSection<LogisticsData>(sections, "logistics");
  const returns = findReportSection<ReturnsData>(sections, "returns");
  const ratios = findReportSection<FinancialRatiosData>(
    sections,
    "financial-ratios"
  );
  const trends = findReportSection<TrendsData>(sections, "trends");
  const inventory = findReportSection<InventorySectionData>(sections, "inventory");
  const health = findReportSection<ReportHealthData>(sections, "report-health");
  const appendix = findReportSection<AppendixSectionData>(sections, "appendix");

  return (
    <article className="report-workspace mx-auto max-w-6xl space-y-6 print:max-w-none print:space-y-4">
      <header className="print:hidden rounded-2xl border border-border bg-card px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-xl">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Business Intelligence Workspace · v{document.metadata.version}
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              {document.metadata.reportName}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {document.summary.headline}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 text-sm tabular-nums">
            {document.summary.metrics.slice(0, 4).map((m) => (
              <div
                key={m.id}
                className="min-w-[6.75rem] rounded-xl border border-primary/20 bg-primary/5 px-3 py-2"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {m.label}
                </p>
                <p className="mt-1 font-semibold tracking-tight text-foreground">
                  {m.format === "currency"
                    ? reportMoney(
                        typeof m.value === "number" ? m.value : null,
                        m.unit ?? currency
                      )
                    : m.format === "percent"
                      ? reportPercent(
                          typeof m.value === "number" ? m.value : null
                        )
                      : m.format === "number"
                        ? reportNumber(
                            typeof m.value === "number" ? m.value : null
                          )
                        : String(m.value ?? "—")}
                </p>
              </div>
            ))}
          </div>
        </div>
        {document.summary.notes?.length ? (
          <p className="mt-3 border-t border-border/50 pt-3 text-xs leading-relaxed text-muted-foreground">
            {document.summary.notes.join(" · ")}
          </p>
        ) : null}
      </header>

      <WorkspaceNav items={[...WORKSPACE_NAV]} />

      <div className="space-y-6 print:space-y-4">
        {executive ? (
          <ExecutiveSummarySection section={executive} currency={currency} />
        ) : null}

        {financial ? (
          <FinancialIntelligenceSection
            financial={financial}
            trends={trends}
            ratios={ratios}
            logistics={logistics}
            returns={returns}
            currency={currency}
          />
        ) : null}

        {brands ? (
          <BrandIntelligenceSection section={brands} currency={currency} />
        ) : null}

        {products ? (
          <ProductIntelligenceSection section={products} currency={currency} />
        ) : null}

        {costs ? (
          <MarketplaceCostAnalysisSection section={costs} currency={currency} />
        ) : null}

        {settlement ? (
          <SettlementReconciliationSection
            section={settlement}
            currency={currency}
          />
        ) : null}

        {inventory ? (
          <InventorySummarySection section={inventory} currency={currency} />
        ) : null}

        {appendix ? (
          <AppendixSectionView
            section={appendix}
            documentAppendix={document.appendix}
            cover={cover}
            health={health}
          />
        ) : null}
      </div>
    </article>
  );
}
