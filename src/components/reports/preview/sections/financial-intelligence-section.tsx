"use client";

import { useMemo } from "react";
import type { TrendsData } from "@/lib/reporting/sections/trends";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { ReportSectionFrame } from "@/components/reports/preview/report-section-frame";
import { ReportTable } from "@/components/reports/preview/report-table";
import { ReportSubsection } from "@/components/reports/preview/report-layout";
import { ReportEmptyState } from "@/components/reports/preview/report-empty-state";
import {
  reportMoney,
  reportNumber,
  reportPercent,
} from "@/components/reports/preview/report-format";
import { netMarginPercent } from "@/lib/reporting/section-utils";
import type { FinancialSummaryData } from "@/lib/reporting/sections/financial-summary";
import type { FinancialRatiosData } from "@/lib/reporting/sections/financial-ratios";
import type { LogisticsData } from "@/lib/reporting/sections/logistics";
import type { ReturnsData } from "@/lib/reporting/sections/returns";
import type { ReportSection } from "@/lib/reporting/types";
import {
  ReportCallout,
  ReportKpiGrid,
} from "@/components/reports/preview/report-section-frame";

type FinancialIntelligenceSectionProps = {
  financial: ReportSection<FinancialSummaryData>;
  trends?: ReportSection<TrendsData> | null;
  ratios?: ReportSection<FinancialRatiosData> | null;
  logistics?: ReportSection<LogisticsData> | null;
  returns?: ReportSection<ReturnsData> | null;
  currency: string;
};

/**
 * Financial Intelligence chapter — FE lines + profit trend + ratios.
 * Presentation only.
 */
export function FinancialIntelligenceSection({
  financial,
  trends,
  ratios,
  logistics,
  returns,
  currency,
}: FinancialIntelligenceSectionProps) {
  const d = financial.data;
  const revenue = d.modelB.revenue;
  const netProfit = d.modelB.finalNetProfit;
  const margin = netMarginPercent(revenue, netProfit);

  const trendChartData = useMemo(() => {
    const series = trends?.data.daily ?? [];
    return series.map((p) => ({
      date: p.key,
      revenue: p.revenue,
      profit: p.profit,
    }));
  }, [trends]);

  return (
    <ReportSectionFrame
      sectionId="financial-intelligence"
      title="Financial Intelligence"
      description={`Commercial Performance (Model B) · Engine ${d.engineVersion}`}
    >
      <ReportKpiGrid
        items={[
          { label: "Revenue", value: reportMoney(revenue, currency) },
          { label: "Net Profit", value: reportMoney(netProfit, currency) },
          { label: "Net Margin", value: reportPercent(margin) },
          {
            label: "Net Sales",
            value: reportMoney(d.modelB.netSales, currency),
          },
        ]}
      />

      <ReportSubsection
        title="Profit trend"
        description="Daily revenue and profit for the selected Report Scope"
      >
        {trendChartData.length > 0 ? (
          <div className="h-[260px] rounded-xl border border-border/60 bg-background/40 p-3 sm:h-[280px]">
            <RevenueChart data={trendChartData} />
          </div>
        ) : (
          <ReportEmptyState variant="no-data" hint="No daily trend points in this scope." />
        )}
      </ReportSubsection>

      <ReportSubsection title="Financial summary">
        <ReportTable
          rowKey={(row) => row.id}
          stickyHeader
          columns={[
            {
              key: "label",
              header: "Line",
              cell: (row) => row.label,
            },
            {
              key: "amount",
              header: "Amount",
              align: "right",
              sortable: true,
              sortValue: (row) => row.amount,
              cell: (row) => reportMoney(row.amount, currency),
            },
          ]}
          rows={d.lines}
        />
        <p className="mt-2 text-xs text-muted-foreground">Source: {d.source}</p>
      </ReportSubsection>

      {ratios && ratios.data.ratios.length > 0 ? (
        <ReportSubsection title="Key ratios">
          <ReportKpiGrid
            columns={4}
            items={ratios.data.ratios.slice(0, 8).map((r) => ({
              label: r.label,
              value:
                r.value == null
                  ? "—"
                  : r.format === "percent"
                    ? reportPercent(r.value)
                    : reportMoney(r.value, currency),
            }))}
          />
        </ReportSubsection>
      ) : null}

      {(logistics || returns) && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {logistics ? (
            <ReportCallout title="Logistics (supporting)">
              <ul className="space-y-1">
                <li>Logistics: {reportMoney(logistics.data.logistics, currency)}</li>
                <li>Storage: {reportMoney(logistics.data.storage, currency)}</li>
                <li>
                  Acceptance: {reportMoney(logistics.data.acceptance, currency)}
                </li>
              </ul>
            </ReportCallout>
          ) : null}
          {returns ? (
            <ReportCallout title="Returns (supporting)">
              <ul className="space-y-1">
                <li>
                  Units returned: {reportNumber(returns.data.returnedUnits)}
                </li>
                <li>Return rate: {reportPercent(returns.data.returnRate)}</li>
                <li>
                  Returned sales:{" "}
                  {reportMoney(returns.data.returnedSales, currency)}
                </li>
              </ul>
            </ReportCallout>
          ) : null}
        </div>
      )}
    </ReportSectionFrame>
  );
}
