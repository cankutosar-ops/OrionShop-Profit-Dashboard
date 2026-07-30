import type { LogisticsData } from "@/lib/reporting/sections/logistics";
import type { ReportSection } from "@/lib/reporting/types";
import {
  ReportKpiGrid,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import {
  reportMoney,
  reportNumber,
  reportPercent,
  reportText,
} from "@/components/reports/preview/report-format";

export function LogisticsAnalysisSection({
  section,
  currency,
}: {
  section: ReportSection<LogisticsData>;
  currency: string;
}) {
  const d = section.data;
  const sku = d.highestLogisticsSku;

  return (
    <ReportSectionFrame
      sectionId="logistics"
      title={section.title}
      description={section.description}
    >
      <ReportKpiGrid
        items={[
          { label: "Logistics", value: reportMoney(d.logistics, currency) },
          { label: "Storage", value: reportMoney(d.storage, currency) },
          { label: "Acceptance", value: reportMoney(d.acceptance, currency) },
          {
            label: "Avg logistics / unit",
            value: reportMoney(d.averageLogisticsCost, currency),
          },
          {
            label: "Logistics % of Revenue",
            value: reportPercent(d.logisticsPercentOfRevenue),
          },
          { label: "Units Sold", value: reportNumber(d.unitsSold) },
        ]}
      />
      <div className="mt-4 rounded-lg border border-border/70 px-3 py-2.5 text-sm">
        <p className="text-xs text-muted-foreground">Highest logistics SKU</p>
        <p className="mt-1 font-medium">
          {sku
            ? `${reportText(sku.modelCode)} · ${reportText(sku.productName)} · ${reportMoney(
                sku.value,
                currency
              )}`
            : "—"}
        </p>
      </div>
    </ReportSectionFrame>
  );
}
