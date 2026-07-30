import type { ReturnsData } from "@/lib/reporting/sections/returns";
import type { ReportSection } from "@/lib/reporting/types";
import {
  ReportKpiGrid,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { ReportTable } from "@/components/reports/preview/report-table";
import {
  reportMoney,
  reportNumber,
  reportPercent,
} from "@/components/reports/preview/report-format";

export function ReturnsAnalysisSection({
  section,
  currency,
}: {
  section: ReportSection<ReturnsData>;
  currency: string;
}) {
  const d = section.data;

  return (
    <ReportSectionFrame
      sectionId="returns"
      title={section.title}
      description={section.description}
    >
      <ReportKpiGrid
        items={[
          { label: "Returned Units", value: reportNumber(d.returnedUnits) },
          {
            label: "Returned Value",
            value: reportMoney(d.returnedValue, currency),
          },
          {
            label: "Returned Sales",
            value: reportMoney(d.returnedSales, currency),
          },
          { label: "Return Rate", value: reportPercent(d.returnRate) },
          { label: "Units Sold", value: reportNumber(d.unitsSold) },
          { label: "Net Units", value: reportNumber(d.netUnits) },
        ]}
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Highest return brands</h3>
          <ReportTable
            compact
            rowKey={(r) => r.brandName}
            columns={[
              { key: "brand", header: "Brand", cell: (r) => r.brandName },
              {
                key: "units",
                header: "Returned",
                align: "right",
                cell: (r) => reportNumber(r.unitsReturned),
              },
              {
                key: "rate",
                header: "Rate",
                align: "right",
                cell: (r) => reportPercent(r.returnRate),
              },
            ]}
            rows={d.highestReturnBrands}
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Highest return SKUs</h3>
          <ReportTable
            compact
            rowKey={(r) => r.productId}
            columns={[
              {
                key: "sku",
                header: "SKU",
                cell: (r) => r.modelCode,
              },
              {
                key: "units",
                header: "Returned",
                align: "right",
                cell: (r) => reportNumber(r.value),
              },
            ]}
            rows={d.highestReturnSkus}
          />
        </div>
      </div>
    </ReportSectionFrame>
  );
}
