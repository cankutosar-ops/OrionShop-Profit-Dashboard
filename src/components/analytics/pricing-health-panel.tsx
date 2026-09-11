"use client";

import { useCallback, useMemo, useState } from "react";
import {
  HEALTH_CONFIDENCE_LABEL,
  HEALTH_STATUS_LABEL,
  type HealthScoreStatus,
} from "@/lib/product-health-score";
import { toPricingHistoricalInputs } from "@/lib/pricing-health";
import {
  buildSmartPricingRow,
  PRICING_V3_STATUS_LABEL,
  type SmartPricingHistoricalStatus as SmartPricingStatus,
} from "@/lib/smart-pricing-historical";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
} from "@/lib/smart-pricing-constants";
import type { ProductPricingHealthRow } from "@/lib/pricing-health";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { formatKpiCount, formatKpiPercent } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type SortKey = "health" | "margin" | "price30" | "difference" | "recovery";

type PricingHealthPanelProps = {
  initialRows: ProductPricingHealthRow[];
  initialTargetMargin?: number;
  initialMarketing?: number;
};

const RECOVERY_ORDER: Record<SmartPricingStatus, number> = {
  unrealistic: 4,
  difficult: 3,
  "small-increase": 2,
  profitable: 1,
  infeasible: 5,
  "no-data": 0,
};

const HEALTH_STATUS_VARIANT: Record<HealthScoreStatus, string> = {
  excellent: "text-success",
  good: "text-success",
  fair: "text-foreground",
  poor: "text-warning",
  critical: "text-danger",
};

const DEFAULT_SORT = { key: "health" as const, direction: "desc" as const };

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return formatCurrency(value);
}

export function PricingHealthPanel({
  initialRows,
  initialTargetMargin = DEFAULT_TARGET_MARGIN_PERCENT,
  initialMarketing = DEFAULT_MARKETING_PERCENT,
}: PricingHealthPanelProps) {
  const [targetMargin, setTargetMargin] = useState(initialTargetMargin);
  const [marketing, setMarketing] = useState(initialMarketing);
  const [search, setSearch] = useState("");
  const { sort, onSort, directionFor, isActive } = useCycleSort<SortKey>(DEFAULT_SORT);

  const rows = useMemo(() => {
    return initialRows.map((initial) => {
      const inputs = toPricingHistoricalInputs(initial);
      const pricing = buildSmartPricingRow(inputs, targetMargin, marketing);
      return {
        ...initial,
        ...pricing,
        healthScore: initial.healthScore,
        healthStatus: initial.healthStatus,
        healthConfidence: initial.healthConfidence,
        mainWeakness: initial.mainWeakness,
        conversionPercent: initial.conversionPercent,
        operationalMarginPercent: initial.operationalMarginPercent,
        logisticsRatioPercent: initial.logisticsRatioPercent,
        orders: initial.orders,
        recoveryStatus: pricing.operationalStatus,
      };
    });
  }, [initialRows, targetMargin, marketing]);

  const summary = useMemo(() => {
    const withHistory = rows.filter((row) => row.hasSalesHistory && row.differencePercent !== null);
    const needingIncrease = withHistory.filter((row) => (row.differencePercent ?? 0) > 0);
    const withHealth = rows.filter((row) => row.orders > 0 || row.hasSalesHistory);

    return {
      productsAnalyzed: withHistory.length,
      averageRequiredIncreasePercent:
        needingIncrease.length > 0
          ? needingIncrease.reduce((sum, row) => sum + (row.differencePercent ?? 0), 0) /
            needingIncrease.length
          : 0,
      productsAboveTarget: withHistory.filter((row) => (row.differencePercent ?? 0) <= 0).length,
      productsNeedingOver20Percent: withHistory.filter((row) => (row.differencePercent ?? 0) > 20)
        .length,
      averageHealthScore:
        withHealth.length > 0
          ? withHealth.reduce((sum, row) => sum + row.healthScore, 0) / withHealth.length
          : 0,
      atRiskCount: withHealth.filter(
        (row) => row.healthStatus === "poor" || row.healthStatus === "critical"
      ).length,
    };
  }, [rows]);

  type EnrichedRow = (typeof rows)[number];

  const getSortValue = useCallback((row: EnrichedRow, key: SortKey): SortValue => {
    switch (key) {
      case "health":
        return row.healthScore;
      case "margin":
        return row.currentNetMarginPercent;
      case "price30":
        return row.priceFor30 ?? -1;
      case "difference":
        return row.differencePercent ?? -999;
      case "recovery":
        return RECOVERY_ORDER[row.recoveryStatus];
    }
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? rows.filter(
          (row) =>
            row.supplierArticle.toLowerCase().includes(q) ||
            row.productName.toLowerCase().includes(q)
        )
      : [...rows];

    return sortRowsBySpec(list, sort, getSortValue);
  }, [rows, search, sort, getSortValue]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Target Operational Margin %</span>
            <input
              type="number"
              min={1}
              max={80}
              step={1}
              value={targetMargin}
              onChange={(e) =>
                setTargetMargin(Number(e.target.value) || DEFAULT_TARGET_MARGIN_PERCENT)
              }
              className="block w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Marketing %</span>
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              value={marketing}
              onChange={(e) => setMarketing(Number(e.target.value) || 0)}
              className="block w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="min-w-[200px] flex-1 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Search SKU</span>
            <input
              type="search"
              placeholder="Supplier article or product name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Health Score from Product Analytics · Smart Pricing V2: operational target uses total
          logistics and operational margin (Product Analytics V7) · Financial target shown as
          secondary reference (purchase logistics only)
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <MetricCard
          size="compact"
          title="Average Health Score"
          value={Math.round(summary.averageHealthScore).toString()}
          subtitle="0–100 composite"
          icon={KPI_ICONS.conversion}
        />
        <MetricCard
          size="compact"
          title="At-risk SKUs"
          value={formatKpiCount(summary.atRiskCount)}
          subtitle="Poor or critical health"
          icon={KPI_ICONS.inventory}
          variant="warning"
        />
        <MetricCard
          size="compact"
          title="Products analyzed"
          value={formatKpiCount(summary.productsAnalyzed)}
          icon={KPI_ICONS.units}
        />
        <MetricCard
          size="compact"
          title="Average required increase"
          value={formatKpiPercent(summary.averageRequiredIncreasePercent)}
          icon={KPI_ICONS.pricing}
        />
        <MetricCard
          size="compact"
          title="Already above target"
          value={formatKpiCount(summary.productsAboveTarget)}
          icon={KPI_ICONS.profit}
          variant="success"
        />
        <MetricCard
          size="compact"
          title="Needing >20% increase"
          value={formatKpiCount(summary.productsNeedingOver20Percent)}
          icon={KPI_ICONS.pricing}
          variant="warning"
        />
      </div>

      <div className="w-full overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h3 className="text-base font-semibold">Health Score + Smart Pricing</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Sorted by health score · Recovery vs operational target {targetMargin}% margin
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1750px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <SortableTh
                  label="Health Score"
                  active={isActive("health")}
                  direction={directionFor("health")}
                  onClick={() => onSort("health")}
                  align="right"
                  className="border-l border-border/60 px-3 py-2"
                />
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Confidence</th>
                <th className="px-3 py-2 font-medium">Main Weakness</th>
                <th className="border-l border-border/60 px-3 py-2 text-right font-medium">
                  Current Avg Price
                </th>
                <th className="px-3 py-2 text-right font-medium">Oper. 20%</th>
                <th className="px-3 py-2 text-right font-medium">Oper. 25%</th>
                <SortableTh
                  label="Oper. 30%"
                  active={isActive("price30")}
                  direction={directionFor("price30")}
                  onClick={() => onSort("price30")}
                  align="right"
                  className="px-3 py-2"
                />
                <th className="px-3 py-2 text-right font-medium">Oper. 35%</th>
                <th className="px-3 py-2 text-right font-medium">Operational Target</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Financial Target
                </th>
                <th className="px-3 py-2 text-right font-medium">Diff (₽)</th>
                <SortableTh
                  label="Diff (%)"
                  active={isActive("difference")}
                  direction={directionFor("difference")}
                  onClick={() => onSort("difference")}
                  align="right"
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Recovery Status"
                  active={isActive("recovery")}
                  direction={directionFor("recovery")}
                  onClick={() => onSort("recovery")}
                  align="left"
                  className="px-3 py-2"
                />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-3 py-8 text-center text-muted-foreground">
                    No products match your search
                  </td>
                </tr>
              ) : (
                filtered.map((row) => <CombinedRow key={row.productId} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CombinedRow({ row }: { row: ProductPricingHealthRow }) {
  const diffVariant =
    row.differencePercent === null
      ? "muted"
      : row.differencePercent <= 0
        ? "success"
        : row.differencePercent > 20
          ? "danger"
          : "default";

  return (
    <tr className="border-b border-border/50 hover:bg-card-hover">
                    <td className="px-3 py-2 font-mono text-xs font-medium text-primary">
                      <a
                        href={`/analytics/simulator?sku=${encodeURIComponent(row.supplierArticle)}`}
                        className="hover:underline"
                        title="Open Decision Simulator"
                      >
                        {row.supplierArticle}
                      </a>
                    </td>
      <td className="max-w-[160px] truncate px-3 py-2" title={row.productName}>
        {row.productName}
      </td>
      <td
        className={cn(
          "border-l border-border/40 px-3 py-2 text-right text-base font-semibold tabular-nums",
          HEALTH_STATUS_VARIANT[row.healthStatus]
        )}
      >
        {row.healthScore}
      </td>
      <td className={cn("px-3 py-2 text-xs font-medium", HEALTH_STATUS_VARIANT[row.healthStatus])}>
        {HEALTH_STATUS_LABEL[row.healthStatus]}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {HEALTH_CONFIDENCE_LABEL[row.healthConfidence]}
      </td>
      <td className="max-w-[140px] truncate px-3 py-2 text-xs text-muted-foreground" title={row.mainWeakness}>
        {row.mainWeakness}
      </td>
      <td className="border-l border-border/40 px-3 py-2 text-right tabular-nums">
        {row.hasSalesHistory ? formatCurrency(row.currentAvgPrice) : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.operationalPriceFor20)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.operationalPriceFor25)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">
        {formatPrice(row.operationalPriceFor30)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.operationalPriceFor35)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-medium text-primary">
        {formatPrice(row.operationalTargetPrice)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {formatPrice(row.financialTargetPrice)}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right tabular-nums",
          diffVariant === "success" && "text-success",
          diffVariant === "danger" && "text-danger",
          diffVariant === "muted" && "text-muted-foreground"
        )}
      >
        {row.differenceRub === null ? "—" : formatCurrency(row.differenceRub)}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right tabular-nums",
          diffVariant === "success" && "text-success",
          diffVariant === "danger" && "text-danger",
          diffVariant === "muted" && "text-muted-foreground"
        )}
      >
        {row.differencePercent === null ? "—" : formatPercent(row.differencePercent)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs">
        {PRICING_V3_STATUS_LABEL[row.recoveryStatus]}
      </td>
    </tr>
  );
}
