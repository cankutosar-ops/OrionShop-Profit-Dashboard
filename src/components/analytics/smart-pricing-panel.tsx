"use client";

import { useCallback, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { SmartPricingExplainDialog } from "@/components/analytics/smart-pricing-explain-dialog";
import {
  buildSmartPricingRow,
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  PRICING_V3_STATUS_LABEL,
  type ProductSmartPricingInputs,
  type SmartPricingComputedRow,
  type SmartPricingStatus,
} from "@/lib/smart-pricing";
import {
  applySmartPricingCommissionSettings,
  COMMISSION_WINDOW_OPTIONS,
  DEFAULT_SMART_PRICING_COMMISSION_SETTINGS,
  formatCommissionSourceLabel,
  type SmartPricingCommissionSettings,
} from "@/lib/smart-pricing-settings";
import {
  adjustTestPrice,
  computeSmartPricingSimulation,
  resolveTestPrice,
  type SmartPricingSimulation,
} from "@/lib/smart-pricing-simulator";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type SmartPricingPanelProps = {
  inputs: ProductSmartPricingInputs[];
  initialTargetMargin?: number;
  initialMarketing?: number;
  initialCommissionSettings?: SmartPricingCommissionSettings;
};

const STATUS_ORDER: Record<SmartPricingStatus, number> = {
  unrealistic: 5,
  difficult: 4,
  "small-increase": 3,
  profitable: 2,
  infeasible: 6,
  "missing-cost": 1,
  "no-data": 0,
};

const STICKY_MODEL_WIDTH = "w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem]";

const stickyModelHeader = cn(
  "sticky left-0 top-0 z-30 bg-card",
  STICKY_MODEL_WIDTH,
  "border-r border-border/60 shadow-[4px_0_8px_-4px_hsl(var(--border))]"
);

function stickyModelCell(isLoss: boolean) {
  return cn(
    "sticky left-0 z-10",
    STICKY_MODEL_WIDTH,
    "border-r border-border/60 shadow-[4px_0_8px_-4px_hsl(var(--border))]",
    isLoss ? "bg-danger/10 group-hover:bg-danger/15" : "bg-card group-hover:bg-card-hover"
  );
}

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return formatCurrency(value);
}

function highVolumeThreshold(rows: ProductSmartPricingInputs[]): number {
  const orders = rows
    .map((row) => row.orders)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);

  if (!orders.length) return 0;
  const index = Math.floor(orders.length * 0.75);
  return orders[Math.min(index, orders.length - 1)] ?? 0;
}

export function SmartPricingPanel({
  inputs,
  initialTargetMargin = DEFAULT_TARGET_MARGIN_PERCENT,
  initialMarketing = DEFAULT_MARKETING_PERCENT,
  initialCommissionSettings,
}: SmartPricingPanelProps) {
  const [targetMargin, setTargetMargin] = useState(initialTargetMargin);
  const [marketing, setMarketing] = useState(initialMarketing);
  const [commissionSettings, setCommissionSettings] = useState<SmartPricingCommissionSettings>(
    initialCommissionSettings ?? DEFAULT_SMART_PRICING_COMMISSION_SETTINGS
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyIncreaseOver20, setOnlyIncreaseOver20] = useState(false);
  const [onlyHighVolume, setOnlyHighVolume] = useState(false);
  const [explainRow, setExplainRow] = useState<SmartPricingComputedRow | null>(null);
  const [testPriceOverrides, setTestPriceOverrides] = useState<Record<string, number>>({});

  const volumeCutoff = useMemo(() => highVolumeThreshold(inputs), [inputs]);

  const rows = useMemo(() => {
    const adjusted = inputs.map((row) =>
      applySmartPricingCommissionSettings(row, commissionSettings)
    );
    return adjusted.map((row) => buildSmartPricingRow(row, targetMargin, marketing));
  }, [inputs, commissionSettings, targetMargin, marketing]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows
      .filter((row) => {
        if (q) {
          const matchesSearch =
            row.supplierArticle.toLowerCase().includes(q) ||
            row.productName.toLowerCase().includes(q);
          if (!matchesSearch) return false;
        }

        if (onlyIncreaseOver20 && (row.differencePercent ?? 0) <= 20) return false;

        if (onlyHighVolume && row.orders < volumeCutoff) return false;

        return true;
      })
      .sort((a, b) => {
        const statusCmp = STATUS_ORDER[b.status] - STATUS_ORDER[a.status];
        if (statusCmp !== 0) return statusCmp;
        return (b.differencePercent ?? -999) - (a.differencePercent ?? -999);
      });
  }, [rows, search, onlyIncreaseOver20, onlyHighVolume, volumeCutoff]);

  const setTestPriceForProduct = useCallback((productId: string, value: number | null) => {
    setTestPriceOverrides((current) => {
      if (value === null || !Number.isFinite(value) || value <= 0) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      return { ...current, [productId]: value };
    });
  }, []);

  const adjustVisibleTestPrices = useCallback(
    (percentDelta: number) => {
      setTestPriceOverrides((current) => {
        const next = { ...current };
        for (const row of filtered) {
          const base = resolveTestPrice(row, current[row.productId]);
          if (base === null) continue;
          next[row.productId] = adjustTestPrice(base, percentDelta);
        }
        return next;
      });
    },
    [filtered]
  );

  const resetAllTestPrices = useCallback(() => {
    setTestPriceOverrides({});
  }, []);

  const explainTestPrice =
    explainRow !== null
      ? resolveTestPrice(explainRow, testPriceOverrides[explainRow.productId])
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Target Margin %</span>
            <input
              type="number"
              min={1}
              max={80}
              step={1}
              value={targetMargin}
              onChange={(event) =>
                setTargetMargin(Number(event.target.value) || DEFAULT_TARGET_MARGIN_PERCENT)
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
              onChange={(event) => setMarketing(Number(event.target.value) || 0)}
              className="block w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="min-w-[200px] flex-1 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Search SKU</span>
            <input
              type="search"
              placeholder="Model or product name…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-card-hover"
          >
            Settings{settingsOpen ? " ▴" : " ▾"}
          </button>
        </div>

        {settingsOpen ? (
          <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Minimum Product Sales
              </span>
              <input
                type="number"
                min={1}
                max={500}
                step={1}
                value={commissionSettings.minProductSales}
                onChange={(event) =>
                  setCommissionSettings((current) => ({
                    ...current,
                    minProductSales: Math.max(1, Number(event.target.value) || 1),
                  }))
                }
                className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Minimum Category Sales
              </span>
              <input
                type="number"
                min={1}
                max={5000}
                step={1}
                value={commissionSettings.minCategorySales}
                onChange={(event) =>
                  setCommissionSettings((current) => ({
                    ...current,
                    minCategorySales: Math.max(1, Number(event.target.value) || 1),
                  }))
                }
                className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Commission History Window
              </span>
              <select
                value={commissionSettings.commissionWindow}
                onChange={(event) =>
                  setCommissionSettings((current) => ({
                    ...current,
                    commissionWindow: event.target.value as SmartPricingCommissionSettings["commissionWindow"],
                  }))
                }
                className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {COMMISSION_WINDOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <FilterToggle
            label="Only increase &gt;20%"
            checked={onlyIncreaseOver20}
            onChange={setOnlyIncreaseOver20}
          />
          <FilterToggle
            label="Only high volume"
            checked={onlyHighVolume}
            onChange={setOnlyHighVolume}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
        <span className="text-xs font-medium text-muted-foreground">Profit Simulator</span>
        <QuickActionButton label="+5%" onClick={() => adjustVisibleTestPrices(5)} />
        <QuickActionButton label="+10%" onClick={() => adjustVisibleTestPrices(10)} />
        <QuickActionButton label="-5%" onClick={() => adjustVisibleTestPrices(-5)} />
        <QuickActionButton label="-10%" onClick={() => adjustVisibleTestPrices(-10)} />
        <button
          type="button"
          onClick={resetAllTestPrices}
          className="ml-auto rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card-hover"
        >
          Reset All
        </button>
      </div>

      <div className="w-full overflow-hidden rounded-2xl border border-border bg-card">
        <div className="max-h-[min(70vh,960px)] overflow-auto">
          <table className="w-full min-w-[1560px] text-sm">
            <thead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className={cn("px-3 py-2 font-medium", stickyModelHeader)}>Model</th>
                <th className="px-3 py-2 text-right font-medium">Average Selling Price</th>
                <th className="px-3 py-2 text-right font-medium">Commission</th>
                <th className="px-3 py-2 font-medium">Risk</th>
                <th className="px-3 py-2 text-right font-medium">20%</th>
                <th className="px-3 py-2 text-right font-medium">25%</th>
                <th className="px-3 py-2 text-right font-medium">30%</th>
                <th className="px-3 py-2 text-right font-medium">35%</th>
                <th className="px-3 py-2 text-right font-medium">Recommended Price</th>
                <th className="px-3 py-2 text-right font-medium">Test Price</th>
                <th className="px-3 py-2 text-right font-medium">Net Profit (₽)</th>
                <th className="px-3 py-2 text-right font-medium">Profit Margin (%)</th>
                <th className="px-3 py-2 text-right font-medium">Diff vs Rec.</th>
                <th className="px-3 py-2 font-medium">Simulator</th>
                <th className="px-3 py-2 text-right font-medium">Difference (₽)</th>
                <th className="px-3 py-2 text-right font-medium">Difference (%)</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-center font-medium">Explain</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={19} className="px-3 py-8 text-center text-muted-foreground">
                    No products match the current filters
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <PricingRow
                    key={row.productId}
                    row={row}
                    testPrice={resolveTestPrice(row, testPriceOverrides[row.productId])}
                    marketing={marketing}
                    onTestPriceChange={(value) => setTestPriceForProduct(row.productId, value)}
                    onExplain={() => setExplainRow(row)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SmartPricingExplainDialog
        row={explainRow}
        targetMarginPercent={targetMargin}
        marketingPercent={marketing}
        testPrice={explainTestPrice}
        onClose={() => setExplainRow(null)}
      />
    </div>
  );
}

function QuickActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card-hover"
    >
      {label}
    </button>
  );
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="rounded border-border"
      />
      <span>{label}</span>
    </label>
  );
}

function RiskScoreCell({ row }: { row: SmartPricingComputedRow }) {
  return (
    <span className="group relative inline-block cursor-help whitespace-nowrap text-xs">
      {row.riskLabel}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-64 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-normal leading-relaxed text-muted-foreground shadow-lg group-hover:block"
      >
        {row.riskTooltip.split("\n").map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}

function PricingRow({
  row,
  testPrice,
  marketing,
  onTestPriceChange,
  onExplain,
}: {
  row: SmartPricingComputedRow;
  testPrice: number | null;
  marketing: number;
  onTestPriceChange: (value: number | null) => void;
  onExplain: () => void;
}) {
  const simulation: SmartPricingSimulation | null = useMemo(() => {
    if (testPrice === null) return null;
    return computeSmartPricingSimulation(row, testPrice, marketing);
  }, [row, testPrice, marketing]);

  const diffVariant =
    row.differencePercent === null
      ? "muted"
      : row.differencePercent <= 0
        ? "success"
        : row.differencePercent > 20
          ? "danger"
          : "default";

  return (
    <tr
      className={cn(
        "group border-b border-border/50 transition-colors hover:bg-card-hover",
        simulation?.isLoss && "bg-danger/10 hover:bg-danger/15"
      )}
    >
      <td
        className={cn(
          "truncate px-3 py-2 font-mono text-xs font-medium text-primary",
          stickyModelCell(simulation?.isLoss ?? false)
        )}
        title={row.productName}
      >
        {row.supplierArticle}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {row.currentAvgPrice !== null ? formatCurrency(row.currentAvgPrice) : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span className="block font-medium">{formatPercent(row.commissionPercent)}</span>
        <span className="block text-[10px] text-muted-foreground">
          {formatCommissionSourceLabel(row.commissionSource)}
        </span>
      </td>
      <td className="px-3 py-2">
        <RiskScoreCell row={row} />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.priceFor20)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.priceFor25)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.priceFor30)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.priceFor35)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-medium text-primary">
        {formatPrice(row.targetPrice)}
      </td>
      <td className="px-3 py-2 text-right">
        <TestPriceInput
          value={testPrice}
          disabled={row.targetPrice === null}
          onChange={onTestPriceChange}
        />
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right tabular-nums font-medium",
          simulation?.isLoss && "text-danger"
        )}
      >
        {simulation ? formatCurrency(simulation.netProfit) : "—"}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right tabular-nums",
          simulation?.isLoss && "text-danger"
        )}
      >
        {simulation ? formatPercent(simulation.profitMarginPercent) : "—"}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right tabular-nums",
          simulation !== null &&
            simulation.differenceVsRecommended !== null &&
            simulation.differenceVsRecommended < 0 &&
            "text-warning",
          simulation !== null &&
            simulation.differenceVsRecommended !== null &&
            simulation.differenceVsRecommended > 0 &&
            "text-primary"
        )}
      >
        {simulation?.differenceVsRecommended === null || simulation?.differenceVsRecommended === undefined
          ? "—"
          : formatCurrency(simulation.differenceVsRecommended)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs">
        {simulation ? simulation.comparisonLabel : "—"}
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
      <td className="whitespace-nowrap px-3 py-2 text-xs">{PRICING_V3_STATUS_LABEL[row.status]}</td>
      <td className="px-3 py-2 text-center">
        <button
          type="button"
          onClick={onExplain}
          disabled={row.purchaseCost === null}
          className="inline-flex rounded-md p-1 text-muted-foreground hover:bg-card-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Explain price for ${row.supplierArticle}`}
          title="Explain Price"
        >
          <Info className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function TestPriceInput({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  if (disabled) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <input
      type="number"
      min={1}
      step={1}
      value={value !== null ? Math.round(value) : ""}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        if (event.target.value === "" || !Number.isFinite(parsed) || parsed <= 0) {
          onChange(null);
          return;
        }
        onChange(parsed);
      }}
      className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm tabular-nums"
      aria-label="Test price"
    />
  );
}
