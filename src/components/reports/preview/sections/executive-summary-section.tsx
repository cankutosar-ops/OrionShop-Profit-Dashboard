"use client";

import type { ExecutiveSummaryData } from "@/lib/reporting/sections/executive-summary";
import type { ReportSection } from "@/lib/reporting/types";
import {
  ReportKpiGrid,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { ReportInsightGrid } from "@/components/reports/preview/report-layout";
import {
  reportMoney,
  reportNumber,
  reportPercent,
  reportText,
} from "@/components/reports/preview/report-format";

export function ExecutiveSummarySection({
  section,
  currency,
}: {
  section: ReportSection<ExecutiveSummaryData>;
  currency: string;
}) {
  const d = section.data;

  return (
    <ReportSectionFrame
      sectionId="executive-summary"
      title="Executive Summary"
      description="Key management KPIs for the selected Report Scope."
    >
      <ReportKpiGrid
        columns={4}
        items={[
          {
            label: "Revenue",
            value: reportMoney(d.revenue, currency),
            emphasis: "primary",
          },
          {
            label: "Net Profit",
            value: reportMoney(d.netProfit, currency),
            emphasis: "primary",
          },
          {
            label: "Margin",
            value: reportPercent(d.marginPercent),
            emphasis: "primary",
          },
          {
            label: "Orders",
            value: reportNumber(d.orders),
            emphasis: "primary",
          },
        ]}
      />

      <ReportInsightGrid
        items={[
          {
            label: "Best brand",
            value: d.bestPerformingBrand
              ? `${d.bestPerformingBrand.name} · ${reportMoney(
                  d.bestPerformingBrand.finalNetProfit,
                  currency
                )}`
              : "—",
          },
          {
            label: "Best product",
            value: d.bestProduct
              ? `${reportText(d.bestProduct.modelCode)} · ${reportMoney(
                  d.bestProduct.value,
                  currency
                )}`
              : "—",
          },
          {
            label: "Needs attention",
            value: d.worstProduct
              ? `${reportText(d.worstProduct.modelCode)} · ${reportMoney(
                  d.worstProduct.value,
                  currency
                )}`
              : "—",
          },
        ]}
      />
    </ReportSectionFrame>
  );
}
