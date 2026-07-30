"use client";

import type { ReportDocument } from "@/lib/reporting/types";
import type { MarketplaceExecutiveInsightsData } from "@/lib/reporting/sections/marketplace-executive-insights";
import type { CategoryIntelligenceData } from "@/lib/reporting/sections/category-intelligence";
import type { ProductInsightsData } from "@/lib/reporting/sections/product-insights";
import type { WarehouseIntelligenceData } from "@/lib/reporting/sections/warehouse-intelligence";
import type { ProductEngagementData } from "@/lib/reporting/sections/product-engagement";
import type { MarketplaceRoadmapData } from "@/lib/reporting/sections/marketplace-roadmap";
import type { MarketplaceCostsData } from "@/lib/reporting/sections/marketplace-costs";
import { findReportSection } from "@/components/reports/preview/report-section-frame";
import { WorkspaceNav } from "@/components/reports/preview/workspace-nav";
import {
  reportMoney,
  reportNumber,
  reportPercent,
} from "@/components/reports/preview/report-format";
import { ExecutiveInsightsSection } from "@/components/marketplace-intelligence/sections/executive-insights-section";
import { CategoryIntelligenceSection } from "@/components/marketplace-intelligence/sections/category-intelligence-section";
import { ProductInsightsSection } from "@/components/marketplace-intelligence/sections/product-insights-section";
import { WarehouseIntelligenceSectionView } from "@/components/marketplace-intelligence/sections/warehouse-intelligence-section";
import { ProductEngagementSection } from "@/components/marketplace-intelligence/sections/product-engagement-section";
import { MarketplaceRoadmapSection } from "@/components/marketplace-intelligence/sections/marketplace-roadmap-section";
import { MarketplaceCostsSnapshotSection } from "@/components/marketplace-intelligence/sections/marketplace-costs-snapshot-section";

const NAV = [
  { id: "marketplace-executive-insights", label: "1 Recommendations" },
  { id: "category-intelligence", label: "2 Categories" },
  { id: "product-insights", label: "3 Products" },
  { id: "warehouse-intelligence", label: "4 Warehouses" },
  { id: "product-engagement", label: "5 Engagement" },
  { id: "marketplace-costs", label: "6 Costs" },
  { id: "marketplace-roadmap", label: "7 Coming Soon" },
] as const;

/**
 * Marketplace Intelligence Workspace — decision surface over ReportDocument.
 */
export function MarketplaceIntelligencePreview({
  document,
}: {
  document: ReportDocument;
}) {
  const currency = document.metadata.company.currency;
  const sections = document.sections;

  const insights = findReportSection<MarketplaceExecutiveInsightsData>(
    sections,
    "marketplace-executive-insights"
  );
  const categories = findReportSection<CategoryIntelligenceData>(
    sections,
    "category-intelligence"
  );
  const products = findReportSection<ProductInsightsData>(
    sections,
    "product-insights"
  );
  const warehouses = findReportSection<WarehouseIntelligenceData>(
    sections,
    "warehouse-intelligence"
  );
  const engagement = findReportSection<ProductEngagementData>(
    sections,
    "product-engagement"
  );
  const costs = findReportSection<MarketplaceCostsData>(
    sections,
    "marketplace-costs"
  );
  const roadmap = findReportSection<MarketplaceRoadmapData>(
    sections,
    "marketplace-roadmap"
  );

  return (
    <article className="report-workspace mx-auto max-w-6xl space-y-6 print:max-w-none print:space-y-4">
      <header className="print:hidden rounded-2xl border border-border bg-card px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-xl">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Marketplace Intelligence · v{document.metadata.version}
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

      <WorkspaceNav items={[...NAV]} />

      <div className="space-y-6 print:space-y-4">
        {insights ? (
          <ExecutiveInsightsSection section={insights} currency={currency} />
        ) : null}
        {categories ? (
          <CategoryIntelligenceSection
            section={categories}
            currency={currency}
          />
        ) : null}
        {products ? (
          <ProductInsightsSection section={products} currency={currency} />
        ) : null}
        {warehouses ? (
          <WarehouseIntelligenceSectionView
            section={warehouses}
            currency={currency}
          />
        ) : null}
        {engagement ? <ProductEngagementSection section={engagement} /> : null}
        {costs ? (
          <MarketplaceCostsSnapshotSection
            section={costs}
            currency={currency}
          />
        ) : null}
        {roadmap ? <MarketplaceRoadmapSection section={roadmap} /> : null}
      </div>
    </article>
  );
}
