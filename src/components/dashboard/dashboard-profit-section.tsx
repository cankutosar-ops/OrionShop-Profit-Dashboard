"use client";

import type { ReactNode } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import { shareOfNetSalesPercent } from "@/lib/financial-engine";
import { calculatePotentialProfitNoReturns } from "@/lib/potential-profit-no-returns";
import { isNetSalesReady } from "@/lib/sales-revenue-resolution";
import { sanitizeUnavailableReason, TEMPORARILY_UNAVAILABLE } from "@/lib/user-facing-errors";
import type {
  ModelBProfitMetrics,
  OrdersPurchasesKpis,
  QuantityMetrics,
} from "@/types/database";

/** Shared expense icon language — never resembles income. */
const EXPENSE_ICON = "from-rose-500/20 to-rose-500/5 text-rose-400";
const EXPENSE_VALUE = "text-rose-300";

/** Distinct treatment for analytical scenario cards (not accounting KPIs). */
const SIMULATION_CARD =
  "border-dashed border-amber-500/35 bg-amber-500/[0.04] ring-1 ring-amber-500/20";

type DashboardProfitSectionProps = {
  modelB: ModelBProfitMetrics;
  quantities: QuantityMetrics;
  kpis: OrdersPurchasesKpis;
  totalOrdersCount: number;
  isEmptyPeriod: boolean;
};

function KpiSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function profitVariant(
  value: number,
  ready: boolean,
  isEmptyPeriod: boolean
): "default" | "success" | "danger" {
  if (isEmptyPeriod || !ready) return "default";
  if (value > 0) return "success";
  if (value < 0) return "danger";
  return "default";
}

export function DashboardProfitSection({
  modelB,
  quantities,
  kpis,
  totalOrdersCount,
  isEmptyPeriod,
}: DashboardProfitSectionProps) {
  const emptyValue = "—";
  const revenueReady = isNetSalesReady(modelB.netSalesStatus);

  const formatMoney = (value: number) => (isEmptyPeriod ? emptyValue : formatKpiCurrency(value));
  const formatRate = (value: number) => (isEmptyPeriod ? emptyValue : formatKpiPercent(value));
  const formatMoneyOrPending = (value: number) => {
    if (isEmptyPeriod) return emptyValue;
    if (!revenueReady) return TEMPORARILY_UNAVAILABLE;
    return formatKpiCurrency(value);
  };

  /** Commercial Performance Net Sales (same base as Gross / Returned Sales). */
  const displayNetSales = modelB.netSales;

  const shareOfEngineSales = (amount: number) => {
    if (isEmptyPeriod || !revenueReady || modelB.netSales <= 0) return emptyValue;
    return formatKpiPercent(shareOfNetSalesPercent(modelB.netSales, amount));
  };

  const expenseProps = {
    iconClassName: EXPENSE_ICON,
    valueClassName: EXPENSE_VALUE,
  } as const;

  const noReturnsScenario = calculatePotentialProfitNoReturns({
    grossSales: modelB.grossSales,
    marketplaceFee: modelB.marketplaceFee ?? modelB.commission,
    productCost: modelB.productCost,
    logistics: modelB.logistics,
    storage: modelB.storage,
    acceptance: modelB.acceptance,
    penalties: modelB.penalties,
    adjustments: modelB.adjustments,
    advertising: modelB.advertising,
    estimatedTax: modelB.estimatedTax,
    currentNetProfit: modelB.finalNetProfit,
  });


  return (
    <KpiSection
      title="Commercial Performance"
      description="Gross → returns → net sales → revenue → expenses → profit for the selected date range"
    >
      <div className="space-y-4">
        {/* Continuous money-flow story — one grid, equal card language */}
        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <MetricCard
            title="Gross Sales"
            value={formatMoneyOrPending(modelB.grossSales)}
            subtitle={
              revenueReady
                ? `${formatKpiCount(quantities.unitsSold)} units sold`
                : sanitizeUnavailableReason(undefined, "Awaiting sales data")
            }
            hint="Merchandise sales amount for completed sales before subtracting Returned Sales."
            icon={KPI_ICONS.purchases}
            variant="default"
          />
          <MetricCard
            title="Returned Sales"
            value={formatMoneyOrPending(modelB.returnedSales)}
            subtitle={
              revenueReady
                ? `${formatKpiCount(quantities.unitsReturned)} units · Return rate ${formatRate(kpis.returnRate)}`
                : sanitizeUnavailableReason(undefined, "Awaiting sales data")
            }
            hint="Sales value associated with returns in the period (same Commercial Performance base as Gross Sales)."
            icon={KPI_ICONS.returns}
            variant="warning"
          />
          <MetricCard
            title="Net Sales"
            value={formatMoneyOrPending(displayNetSales)}
            subtitle={
              revenueReady
                ? "Gross Sales − Returned Sales"
                : sanitizeUnavailableReason(undefined, "Awaiting sales data")
            }
            hint="Merchandise sales after returns under Commercial Performance (Gross Sales − Returned Sales)."
            icon={KPI_ICONS.revenue}
            variant="default"
          />
          <MetricCard
            title="Revenue"
            value={formatMoneyOrPending(modelB.revenue)}
            subtitle={`${shareOfEngineSales(modelB.revenue)} of Net Sales`}
            hint="Seller marketplace payable amount for the period — distinct from Gross Sales and Net Sales."
            icon={KPI_ICONS.revenue}
            variant="success"
          />

          <MetricCard
            title="Marketplace Fee"
            value={formatMoneyOrPending(modelB.marketplaceFee ?? modelB.commission)}
            subtitle={`${shareOfEngineSales(modelB.marketplaceFee ?? modelB.commission)} of sales`}
            hint="Sales − Sales API forPay (priceWithDisc net). Not from ppvz_sales_commission / ppvz_reward / ppvz_vw."
            icon={KPI_ICONS.commission}
            {...expenseProps}
          />
          <MetricCard
            title="Product Cost"
            value={formatMoney(modelB.productCost)}
            subtitle={`${shareOfEngineSales(modelB.productCost)} of sales`}
            icon={KPI_ICONS.cost}
            {...expenseProps}
          />
          <MetricCard
            title="Logistics"
            value={formatMoney(modelB.logistics)}
            subtitle={`${shareOfEngineSales(modelB.logistics)} of sales`}
            icon={KPI_ICONS.logistics}
            {...expenseProps}
          />
          <MetricCard
            title="Storage"
            value={formatMoney(modelB.storage)}
            subtitle={`${shareOfEngineSales(modelB.storage)} of sales`}
            icon={KPI_ICONS.storage}
            {...expenseProps}
          />
          <MetricCard
            title="Acceptance"
            value={formatMoney(modelB.acceptance)}
            subtitle={`${shareOfEngineSales(modelB.acceptance)} of sales`}
            hint="Finance acceptance operations."
            icon={KPI_ICONS.storage}
            {...expenseProps}
          />
          <MetricCard
            title="Penalties"
            value={formatMoney(modelB.penalties)}
            subtitle={`${shareOfEngineSales(modelB.penalties)} of sales`}
            icon={KPI_ICONS.penalties}
            {...expenseProps}
          />
          <MetricCard
            title="Adjustments"
            value={formatMoney(modelB.adjustments)}
            subtitle={`${shareOfEngineSales(modelB.adjustments)} of sales`}
            hint="Finance adjustments for the selected period (includes advertising and other marketplace holds)."
            icon={KPI_ICONS.adjustments}
            {...expenseProps}
          />
          <MetricCard
            title="Acquiring"
            value={formatMoney(modelB.acquiring)}
            subtitle={`${shareOfEngineSales(modelB.acquiring)} of sales`}
            hint="Finance acquiring_fee — already reflected before Revenue; not deducted again in Net Profit."
            icon={KPI_ICONS.acquiring}
            {...expenseProps}
          />
          <MetricCard
            title="Estimated Tax"
            value={formatMoneyOrPending(modelB.estimatedTax)}
            subtitle={
              revenueReady
                ? `${modelB.taxPercent}% of finishedPrice`
                : sanitizeUnavailableReason(undefined, "Awaiting revenue data")
            }
            hint="Estimated Tax = Tax% × Σ Sales API finishedPrice (customer paid to Wildberries)."
            icon={KPI_ICONS.tax}
            {...expenseProps}
          />

          <MetricCard
            title="Operating Profit"
            value={formatMoneyOrPending(modelB.operatingProfit)}
            subtitle={
              revenueReady
                ? `${shareOfEngineSales(modelB.operatingProfit)} of sales · before tax`
                : sanitizeUnavailableReason(undefined, "Awaiting revenue data")
            }
            hint="Revenue − Product Cost − Logistics − Storage − Acceptance − Penalties − Adjustments (before tax)."
            icon={KPI_ICONS.profit}
            variant={profitVariant(modelB.operatingProfit, revenueReady, isEmptyPeriod)}
          />
          <MetricCard
            title="Net Profit"
            value={formatMoneyOrPending(modelB.finalNetProfit)}
            subtitle={
              revenueReady
                ? `${shareOfEngineSales(modelB.finalNetProfit)} of sales · after tax`
                : sanitizeUnavailableReason(undefined, "Awaiting revenue data")
            }
            hint="Revenue − Product Cost − Logistics − Storage − Acceptance − Penalties − Adjustments − Estimated Tax. Marketplace Fee and Acquiring are not deducted again."
            icon={KPI_ICONS.profit}
            className="ring-1 ring-primary/30"
            variant={profitVariant(modelB.finalNetProfit, revenueReady, isEmptyPeriod)}
          />

          <MetricCard
            title="Return Profit Impact"
            value={formatMoneyOrPending(noReturnsScenario.returnProfitImpact)}
            subtitle={
              revenueReady
                ? "Potential Profit − Net Profit"
                : sanitizeUnavailableReason(undefined, "Awaiting revenue data")
            }
            hint="Simulation only. Positive value = profit lost because of returns. Not an accounting KPI."
            badge="Simulation"
            icon={KPI_ICONS.returns}
            className={SIMULATION_CARD}
            variant={profitVariant(
              noReturnsScenario.returnProfitImpact,
              revenueReady,
              isEmptyPeriod
            )}
          />
          <MetricCard
            title="Potential Profit (No Returns)"
            value={formatMoneyOrPending(noReturnsScenario.potentialProfit)}
            subtitle={
              revenueReady ? (
                <div className="space-y-0.5">
                  <div>Estimated profit assuming all returned orders were completed.</div>
                  <div className="tabular-nums text-foreground/80">
                    {isEmptyPeriod
                      ? emptyValue
                      : formatKpiPercent(noReturnsScenario.marginPercentOfGrossSales)}{" "}
                    of Gross Sales
                  </div>
                </div>
              ) : (
                sanitizeUnavailableReason(undefined, "Awaiting revenue data")
              )
            }
            hint="Simulation only. Returns are ignored. This is not an accounting KPI. Gross Sales − Marketplace Fee − Product Cost − Logistics − Storage − Acceptance − Penalties − Adjustments − Advertising − Estimated Tax."
            badge="No Returns Scenario"
            icon={KPI_ICONS.profit}
            className={SIMULATION_CARD}
            variant={profitVariant(
              noReturnsScenario.potentialProfit,
              revenueReady,
              isEmptyPeriod
            )}
          />
        </div>

        <div className="border-t border-border/60 pt-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Operational Metrics
          </p>
          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Units Sold"
              value={formatKpiCount(quantities.unitsSold)}
              icon={KPI_ICONS.purchases}
              variant="success"
            />
            <MetricCard
              title="Returned Units"
              value={formatKpiCount(quantities.unitsReturned)}
              subtitle={`Return Rate ${formatRate(kpis.returnRate)}`}
              icon={KPI_ICONS.returns}
              variant={quantities.unitsReturned > 0 ? "warning" : "default"}
              hint="Unit counts for the selected date range. Monetary returns are under Returned Sales."
            />
            <MetricCard
              title="Net Units"
              value={formatKpiCount(quantities.netUnits)}
              icon={KPI_ICONS.units}
              variant="default"
            />
            <MetricCard
              title="Orders"
              value={formatKpiCount(totalOrdersCount)}
              subtitle={
                isEmptyPeriod ? (
                  emptyValue
                ) : (
                  <div className="space-y-0.5">
                    <div>{formatKpiCount(kpis.ordersCount)} non-cancelled</div>
                    <div className="tabular-nums text-foreground/80">
                      {formatMoney(kpis.ordersValue)}
                    </div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Order Value (Total Price)
                    </div>
                  </div>
                )
              }
              icon={KPI_ICONS.orders}
              variant="default"
              hint="Orders Amount is the total monetary value of customer orders (Orders dataset). Order ≠ Sale."
            />
          </div>
        </div>
      </div>
    </KpiSection>
  );
}
