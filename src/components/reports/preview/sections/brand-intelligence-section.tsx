"use client";

import { useMemo, useState } from "react";
import type { BrandProfitabilityData } from "@/lib/reporting/sections/brand-profitability";
import type { ReportSection } from "@/lib/reporting/types";
import { BrandContributionChart } from "@/components/reports/preview/brand-contribution-chart";
import {
  ReportKpiGrid,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { ReportTable } from "@/components/reports/preview/report-table";
import {
  ReportFilterBar,
  ReportFilterField,
  ReportSubsection,
  reportFilterControlClassName,
} from "@/components/reports/preview/report-layout";
import {
  reportMoney,
  reportNumber,
  reportPercent,
} from "@/components/reports/preview/report-format";

export function BrandIntelligenceSection({
  section,
  currency,
}: {
  section: ReportSection<BrandProfitabilityData>;
  currency: string;
}) {
  const d = section.data;
  const [query, setQuery] = useState("");
  const [marginFilter, setMarginFilter] = useState<"all" | "positive" | "negative">(
    "all"
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return d.brands.filter((b) => {
      if (q && !b.brandName.toLowerCase().includes(q)) return false;
      if (marginFilter === "positive" && b.netProfit < 0) return false;
      if (marginFilter === "negative" && b.netProfit >= 0) return false;
      return true;
    });
  }, [d.brands, marginFilter, query]);

  const chartData = useMemo(
    () =>
      [...d.brands]
        .sort((a, b) => b.netProfit - a.netProfit)
        .slice(0, 8)
        .map((b) => ({
          brand: b.brandName,
          netProfit: b.netProfit,
          revenue: b.revenue,
        })),
    [d.brands]
  );

  return (
    <ReportSectionFrame
      sectionId="brand-intelligence"
      title="Brand Intelligence"
      description="Brand contribution and cost structure from product-level Financial Engine outputs."
    >
      <ReportKpiGrid
        items={[
          { label: "Brands", value: reportNumber(d.totals.brandCount) },
          { label: "Revenue", value: reportMoney(d.totals.revenue, currency) },
          {
            label: "Net Profit",
            value: reportMoney(d.totals.finalNetProfit, currency),
          },
          { label: "Units Sold", value: reportNumber(d.totals.unitsSold) },
        ]}
      />

      <ReportSubsection
        title="Brand profitability"
        description="Top brands by net profit"
      >
        <div className="h-[240px] rounded-xl border border-border/60 bg-background/40 p-3 sm:h-[260px]">
          <BrandContributionChart data={chartData} height={220} />
        </div>
      </ReportSubsection>

      <ReportSubsection title="Brand comparison">
        <ReportFilterBar meta={`Showing ${filtered.length} of ${d.brands.length}`}>
          <ReportFilterField label="Filter brand" className="min-w-[14rem] flex-1">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brand…"
              className={reportFilterControlClassName}
            />
          </ReportFilterField>
          <ReportFilterField label="Profitability">
            <select
              value={marginFilter}
              onChange={(e) =>
                setMarginFilter(e.target.value as "all" | "positive" | "negative")
              }
              className={reportFilterControlClassName}
            >
              <option value="all">All brands</option>
              <option value="positive">Positive profit</option>
              <option value="negative">Negative profit</option>
            </select>
          </ReportFilterField>
        </ReportFilterBar>

        <ReportTable
          rowKey={(row) => row.brandName}
          defaultSortKey="netProfit"
          defaultSortDir="desc"
          stickyHeader
          minWidthClassName="min-w-[980px]"
          columns={[
            {
              key: "brand",
              header: "Brand",
              sortable: true,
              sortValue: (r) => r.brandName,
              cell: (r) => r.brandName,
              minWidth: "7rem",
            },
            {
              key: "revenue",
              header: "Revenue",
              align: "right",
              sortable: true,
              sortValue: (r) => r.revenue,
              cell: (r) => reportMoney(r.revenue, currency),
            },
            {
              key: "orders",
              header: "Orders",
              align: "right",
              sortable: true,
              sortValue: (r) => r.orders,
              cell: (r) => reportNumber(r.orders),
            },
            {
              key: "units",
              header: "Units",
              align: "right",
              sortable: true,
              sortValue: (r) => r.unitsSold,
              cell: (r) => reportNumber(r.unitsSold),
            },
            {
              key: "fee",
              header: "Marketplace Fee",
              align: "right",
              sortable: true,
              sortValue: (r) => r.marketplaceFee,
              cell: (r) => reportMoney(r.marketplaceFee, currency),
            },
            {
              key: "logistics",
              header: "Logistics",
              align: "right",
              sortable: true,
              sortValue: (r) => r.logistics,
              cell: (r) => reportMoney(r.logistics, currency),
            },
            {
              key: "storage",
              header: "Storage",
              align: "right",
              sortable: true,
              sortValue: (r) => r.storage,
              cell: (r) => reportMoney(r.storage, currency),
            },
            {
              key: "cost",
              header: "Product Cost",
              align: "right",
              sortable: true,
              sortValue: (r) => r.productCost,
              cell: (r) => reportMoney(r.productCost, currency),
            },
            {
              key: "netProfit",
              header: "Net Profit",
              align: "right",
              sortable: true,
              sortValue: (r) => r.netProfit,
              cell: (r) => reportMoney(r.netProfit, currency),
            },
            {
              key: "margin",
              header: "Net Margin %",
              align: "right",
              sortable: true,
              sortValue: (r) => r.netMarginPercent,
              cell: (r) => reportPercent(r.netMarginPercent),
            },
            {
              key: "contrib",
              header: "Contribution %",
              align: "right",
              sortable: true,
              sortValue: (r) => r.contributionPercent,
              cell: (r) => reportPercent(r.contributionPercent),
            },
            {
              key: "returnRate",
              header: "Return %",
              align: "right",
              sortable: true,
              sortValue: (r) => r.returnRate,
              cell: (r) => reportPercent(r.returnRate),
            },
            {
              key: "asp",
              header: "ASP",
              align: "right",
              sortable: true,
              sortValue: (r) => r.averageSellingPrice,
              cell: (r) => reportMoney(r.averageSellingPrice, currency),
            },
          ]}
          rows={filtered}
        />
      </ReportSubsection>
    </ReportSectionFrame>
  );
}
