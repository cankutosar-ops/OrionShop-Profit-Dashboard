"use client";

import type { ProductInsightsData } from "@/lib/reporting/sections/product-insights";
import type { RankedProduct } from "@/lib/reporting/section-utils";
import type { ReportSection } from "@/lib/reporting/types";
import {
  ReportCallout,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { ReportSubsection } from "@/components/reports/preview/report-layout";
import { ReportTable } from "@/components/reports/preview/report-table";
import {
  reportMoney,
  reportNumber,
  reportPercent,
  reportText,
} from "@/components/reports/preview/report-format";

function ProductBoard({
  title,
  description,
  rows,
  valueHeader,
  format,
  currency,
}: {
  title: string;
  description: string;
  rows: RankedProduct[];
  valueHeader: string;
  format: "currency" | "percent" | "number";
  currency: string;
}) {
  return (
    <ReportSubsection title={title} description={description} className="mt-0">
      <ReportTable
        compact
        stickyHeader
        emptyMessage="No products in this board."
        rowKey={(r) => `${title}-${r.productId}`}
        minWidthClassName="min-w-[320px]"
        columns={[
          {
            key: "rank",
            header: "#",
            align: "right",
            cell: (r) => reportNumber(r.rank),
          },
          {
            key: "sku",
            header: "SKU",
            cell: (r) => reportText(r.modelCode),
          },
          {
            key: "value",
            header: valueHeader,
            align: "right",
            cell: (r) =>
              format === "currency"
                ? reportMoney(r.value, currency)
                : format === "percent"
                  ? reportPercent(r.value)
                  : reportNumber(r.value),
          },
        ]}
        rows={rows}
      />
    </ReportSubsection>
  );
}

export function ProductInsightsSection({
  section,
  currency,
}: {
  section: ReportSection<ProductInsightsData>;
  currency: string;
}) {
  const d = section.data;

  return (
    <ReportSectionFrame
      sectionId="product-insights"
      title="Product Intelligence"
      description="Insight boards for assortment decisions — full portfolio stays in Business Intelligence."
    >
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <ProductBoard
          title="Highest margin"
          description="Protect price and stock"
          rows={d.highestMargin}
          valueHeader="Margin %"
          format="percent"
          currency={currency}
        />
        <ProductBoard
          title="Lowest margin"
          description="Fix fee, cost, or exit"
          rows={d.lowestMargin}
          valueHeader="Margin %"
          format="percent"
          currency={currency}
        />
        <ProductBoard
          title="Highest revenue"
          description="Scale carefully vs profit"
          rows={d.highestRevenue}
          valueHeader="Revenue"
          format="currency"
          currency={currency}
        />
        <ProductBoard
          title="Fastest selling"
          description="Units sold in period"
          rows={d.fastestSelling}
          valueHeader="Units"
          format="number"
          currency={currency}
        />
        <ProductBoard
          title="Highest return"
          description="Quality / listing risk"
          rows={d.highestReturn}
          valueHeader="Return %"
          format="percent"
          currency={currency}
        />
      </div>

      <ReportCallout title="Decision cue" tone="info">
        High revenue with low margin burns cash. High returns with fast sales
        may need listing or quality fixes before restock.
      </ReportCallout>
    </ReportSectionFrame>
  );
}
