"use client";

import { useMemo, useState } from "react";
import type { ProductPerformanceData } from "@/lib/reporting/sections/product-performance";
import type { ReportSection } from "@/lib/reporting/types";
import {
  ReportCallout,
  ReportKpiGrid,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { ReportTable } from "@/components/reports/preview/report-table";
import { ReportUnavailableCell } from "@/components/reports/preview/report-empty-state";
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
  reportText,
} from "@/components/reports/preview/report-format";

export function ProductIntelligenceSection({
  section,
  currency,
}: {
  section: ReportSection<ProductPerformanceData>;
  currency: string;
}) {
  const d = section.data;
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [category, setCategory] = useState("all");
  const [profitFilter, setProfitFilter] = useState<"all" | "positive" | "negative">(
    "all"
  );

  const brands = useMemo(() => {
    const set = new Set(d.portfolio.map((p) => p.brandName));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [d.portfolio]);

  const categories = useMemo(() => {
    const set = new Set(d.portfolio.map((p) => p.categoryName));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [d.portfolio]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return d.portfolio.filter((p) => {
      if (brand !== "all" && p.brandName !== brand) return false;
      if (category !== "all" && p.categoryName !== category) return false;
      if (profitFilter === "positive" && p.netProfit < 0) return false;
      if (profitFilter === "negative" && p.netProfit >= 0) return false;
      if (!q) return true;
      return (
        p.sku.toLowerCase().includes(q) ||
        p.productName.toLowerCase().includes(q) ||
        p.brandName.toLowerCase().includes(q)
      );
    });
  }, [brand, category, d.portfolio, profitFilter, query]);

  return (
    <ReportSectionFrame
      sectionId="product-intelligence"
      title="Product Intelligence"
      description="Full product portfolio for the selected reporting period (Financial Engine product rows)."
    >
      <ReportKpiGrid
        items={[
          {
            label: "Products",
            value: reportNumber(d.portfolioTotals.productCount),
          },
          {
            label: "Revenue",
            value: reportMoney(d.portfolioTotals.revenue, currency),
          },
          {
            label: "Net Profit",
            value: reportMoney(d.portfolioTotals.netProfit, currency),
          },
          {
            label: "Orders",
            value: reportNumber(d.portfolioTotals.orders),
          },
        ]}
      />

      <ReportCallout title="Engagement metrics" tone="info">
        Favorites and Cart use a shared “Not available” state until Wildberries Sales Funnel
        Analytics is synced. Portfolio economics below use existing Financial Engine product rows
        only.
      </ReportCallout>

      <ReportSubsection title="Product portfolio">
        <ReportFilterBar
          meta={`Showing ${filtered.length} of ${d.portfolio.length}`}
        >
          <ReportFilterField label="Search" className="min-w-[14rem] flex-1">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SKU, product, brand…"
              className={reportFilterControlClassName}
            />
          </ReportFilterField>
          <ReportFilterField label="Brand">
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className={reportFilterControlClassName}
            >
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </ReportFilterField>
          <ReportFilterField label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={reportFilterControlClassName}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </ReportFilterField>
          <ReportFilterField label="Profitability">
            <select
              value={profitFilter}
              onChange={(e) =>
                setProfitFilter(e.target.value as "all" | "positive" | "negative")
              }
              className={reportFilterControlClassName}
            >
              <option value="all">All</option>
              <option value="positive">Positive profit</option>
              <option value="negative">Negative profit</option>
            </select>
          </ReportFilterField>
        </ReportFilterBar>

        <ReportTable
          rowKey={(row) => row.productId}
          defaultSortKey="netProfit"
          defaultSortDir="desc"
          stickyHeader
          minWidthClassName="min-w-[1180px]"
          columns={[
            {
              key: "sku",
              header: "SKU",
              sortable: true,
              sortValue: (r) => r.sku,
              minWidth: "9rem",
              cell: (r) => (
                <span>
                  <span className="font-medium">{reportText(r.sku)}</span>
                  <span className="mt-0.5 block max-w-[12rem] truncate text-[11px] text-muted-foreground">
                    {reportText(r.productName)}
                  </span>
                </span>
              ),
            },
            {
              key: "brand",
              header: "Brand",
              sortable: true,
              sortValue: (r) => r.brandName,
              cell: (r) => reportText(r.brandName),
            },
            {
              key: "category",
              header: "Category",
              sortable: true,
              sortValue: (r) => r.categoryName,
              cell: (r) => reportText(r.categoryName),
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
              key: "purchases",
              header: "Buyout",
              align: "right",
              sortable: true,
              sortValue: (r) => r.purchases,
              cell: (r) => reportNumber(r.purchases),
            },
            {
              key: "conversion",
              header: "Conversion %",
              align: "right",
              sortable: true,
              sortValue: (r) => r.conversionPercent,
              cell: (r) => reportPercent(r.conversionPercent),
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
              key: "fee",
              header: "Marketplace Fee",
              align: "right",
              sortable: true,
              sortValue: (r) => r.marketplaceFees,
              cell: (r) => reportMoney(r.marketplaceFees, currency),
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
              header: "Margin %",
              align: "right",
              sortable: true,
              sortValue: (r) => r.marginPercent,
              cell: (r) => reportPercent(r.marginPercent),
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
              key: "stock",
              header: "Stock",
              align: "right",
              cell: () => <ReportUnavailableCell />,
            },
            {
              key: "warehouse",
              header: "Warehouse",
              cell: () => <ReportUnavailableCell />,
            },
            {
              key: "favorites",
              header: "Favorites",
              align: "right",
              cell: () => <ReportUnavailableCell />,
            },
            {
              key: "cart",
              header: "Cart",
              align: "right",
              cell: () => <ReportUnavailableCell />,
            },
          ]}
          rows={filtered}
        />
      </ReportSubsection>
    </ReportSectionFrame>
  );
}
