import { MetricCard } from "@/components/dashboard/metric-card";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";

export type ReportSummaryLine = {
  id: string;
  label: string;
  amount: number;
  isPercent?: boolean;
  /** Format as unit count (not currency). */
  isCount?: boolean;
  isTotal?: boolean;
};

type ReportSummaryCardsProps = {
  lines: ReportSummaryLine[];
  currency?: string;
  highlightIds?: string[];
};

const ICON_BY_LINE: Record<string, keyof typeof KPI_ICONS> = {
  grossSales: "revenue",
  returns: "returns",
  netSales: "revenue",
  revenue: "settlement",
  marketplaceFees: "commission",
  logistics: "logistics",
  returnLogistics: "returns",
  storage: "storage",
  acceptance: "cost",
  penalties: "penalties",
  otherDeductions: "adjustments",
  netTransfer: "wallet",
  productCost: "cost",
  advertising: "advertising",
  estimatedTax: "tax",
  netProfit: "profit",
  netMargin: "conversion",
  unitsSold: "orders",
  groupCount: "orders",
};

/**
 * Shared summary card grid for reporting — uses dashboard MetricCard language.
 */
export function ReportSummaryCards({
  lines,
  currency = "RUB",
  highlightIds = ["netProfit", "netMargin", "netTransfer"],
}: ReportSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {lines.map((line) => {
        const iconKey = ICON_BY_LINE[line.id] ?? "revenue";
        const Icon = KPI_ICONS[iconKey] ?? KPI_ICONS.revenue;
        const emphasize = highlightIds.includes(line.id);
        const isPrimaryResult = line.id === "netTransfer" || line.id === "netProfit";
        return (
          <MetricCard
            key={line.id}
            title={line.label}
            icon={Icon}
            value={
              line.isPercent
                ? formatKpiPercent(line.amount)
                : line.isCount
                  ? formatKpiCount(line.amount)
                  : formatKpiCurrency(line.amount, currency)
            }
            size={emphasize ? "default" : "compact"}
            variant={
              isPrimaryResult
                ? line.amount > 0
                  ? "success"
                  : line.amount < 0
                    ? "danger"
                    : "default"
                : "default"
            }
            className={
              emphasize && line.id === "netTransfer" ? "ring-1 ring-primary/30" : undefined
            }
          />
        );
      })}
    </div>
  );
}
