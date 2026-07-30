"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  canExpandSmartPricingCostBreakdown,
  SmartPricingCostBreakdownDetail,
} from "@/components/analytics/smart-pricing-calc-panel";
import { SmartPricingExplainDialog } from "@/components/analytics/smart-pricing-explain-dialog";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import {
  buildSmartPricingRow,
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  DEFAULT_TAX_PERCENT,
  type ProductSmartPricingInputs,
  type SmartPricingComputedRow,
} from "@/lib/smart-pricing";
import { DEFAULT_USD_EXCHANGE_RATE } from "@/lib/smart-pricing-constants";
import {
  applySmartPricingCommissionSettings,
  COMMISSION_WINDOW_OPTIONS,
  DEFAULT_SMART_PRICING_COMMISSION_SETTINGS,
  type SmartPricingCommissionSettings,
} from "@/lib/smart-pricing-settings";
import {
  adjustTestPrice,
  computeSmartPricingSimulation,
  convertRubToUsd,
  resolveTestPrice,
  type SmartPricingSimulation,
} from "@/lib/smart-pricing-simulator";
import {
  loadSmartPricingUiSettings,
  saveSmartPricingUiSettings,
} from "@/lib/smart-pricing-ui-settings";
import { FILTER_PARAMS } from "@/lib/filter-params";
import { PRODUCT_INTEL_NAV_PARAMS } from "@/lib/product-intelligence-nav";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type SmartPricingPanelProps = {
  inputs: ProductSmartPricingInputs[];
  /** Header Brand Filter from URL — server already scoped `inputs` to this brand. */
  scopeBrandId?: string;
  initialTargetMargin?: number;
  initialMarketing?: number;
  initialCommissionSettings?: SmartPricingCommissionSettings;
};

/**
 * Frozen left columns (horizontal stick).
 * Decision columns through Test Price should fit without horizontal scroll.
 */
const STICKY_COLS = [
  { key: "model", width: 100 },
  { key: "asp", width: 88 },
  { key: "commission", width: 64 },
  { key: "currentNp", width: 104 },
] as const;

const DECISION_COLS = [
  ...STICKY_COLS,
  { key: "currentMargin", width: 72 },
  { key: "markup", width: 68 },
  { key: "m15", width: 72 },
  { key: "m20", width: 72 },
  { key: "recommended", width: 100 },
  { key: "testPrice", width: 92 },
] as const;

const STICKY_LEFT: number[] = STICKY_COLS.reduce<number[]>((acc, col, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1]! + STICKY_COLS[i - 1]!.width);
  return acc;
}, []);

const DECISION_MIN_WIDTH = DECISION_COLS.reduce((sum, col) => sum + col.width, 0);
/** Extra width for scrollable columns after Test Price. */
const SCROLL_TAIL_MIN = 560;

type PricingSortKey =
  | "model"
  | "avgSell"
  | "commission"
  | "currentNp"
  | "currentMargin"
  | "markup"
  | "m15"
  | "m20"
  | "recommended"
  | "testPrice"
  | "risk"
  | "testNp"
  | "testMargin"
  | "diffVsRec"
  | "simulator"
  | "differenceRub"
  | "differencePercent"
  | "costMultiplier";

function pricingSortValue(
  row: SmartPricingComputedRow,
  key: PricingSortKey,
  testPriceOverrides: Record<string, number>,
  marketing: number,
  taxPercent: number
): SortValue {
  switch (key) {
    case "model":
      return row.supplierArticle;
    case "avgSell":
      return row.currentAvgPrice;
    case "commission":
      return row.commissionPercent;
    case "currentNp":
      return row.currentNetProfit;
    case "currentMargin":
      return row.currentMarginPercent;
    case "markup":
      return row.currentMarkupOnCostPercent;
    case "m15":
      return row.priceFor15;
    case "m20":
      return row.priceFor20;
    case "recommended":
      return row.targetPrice;
    case "testPrice":
      return resolveTestPrice(row, testPriceOverrides[row.productId]);
    case "risk":
      return row.riskLabel;
    case "testNp":
    case "testMargin":
    case "diffVsRec":
    case "simulator": {
      const testPrice = resolveTestPrice(row, testPriceOverrides[row.productId]);
      if (testPrice === null) return null;
      const simulation = computeSmartPricingSimulation(row, testPrice, marketing, taxPercent);
      if (!simulation) return null;
      if (key === "testNp") return simulation.netProfit;
      if (key === "testMargin") return simulation.profitMarginPercent;
      if (key === "diffVsRec") return simulation.differenceVsRecommended;
      return simulation.comparisonLabel;
    }
    case "differenceRub":
      return row.differenceRub;
    case "differencePercent":
      return row.differencePercent;
    case "costMultiplier":
      if (
        row.currentAvgPrice == null ||
        row.purchaseCost == null ||
        !Number.isFinite(row.currentAvgPrice) ||
        !Number.isFinite(row.purchaseCost) ||
        row.purchaseCost <= 0
      ) {
        return null;
      }
      return row.currentAvgPrice / row.purchaseCost;
  }
}

const fieldClass =
  "block h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm tabular-nums";
const labelClass = "block text-[11px] font-medium leading-none text-muted-foreground";

function stickyHeader(index: number): string {
  const isLast = index === STICKY_COLS.length - 1;
  return cn(
    "sticky top-0 z-30 bg-card px-1.5 py-2 text-right text-[11px] font-medium",
    index === 0 && "text-left",
    isLast && "border-r border-border/60 shadow-[4px_0_8px_-4px_hsl(var(--border))]"
  );
}

function stickyCell(index: number, highlight: boolean): string {
  const isLast = index === STICKY_COLS.length - 1;
  return cn(
    "sticky z-10 px-1.5 py-1.5 text-right tabular-nums",
    index === 0 && "text-left",
    isLast && "border-r border-border/60 shadow-[4px_0_8px_-4px_hsl(var(--border))]",
    highlight
      ? "bg-danger/10 group-hover:bg-danger/15"
      : "bg-card group-hover:bg-card-hover"
  );
}

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return formatCurrency(value);
}

/** Display-only: Avg Sell / Product Cost. Does not feed any pricing formulas. */
function formatCostMultiplier(
  avgSell: number | null | undefined,
  productCost: number | null | undefined
): string {
  if (
    avgSell == null ||
    productCost == null ||
    !Number.isFinite(avgSell) ||
    !Number.isFinite(productCost) ||
    productCost <= 0
  ) {
    return "—";
  }
  return `${(avgSell / productCost).toFixed(2)}×`;
}

function MoneyRubUsd({
  rub,
  usdRate,
  danger,
  emphasize,
}: {
  rub: number | null;
  usdRate: number;
  danger?: boolean;
  emphasize?: boolean;
}) {
  if (rub === null) return <span className="text-muted-foreground">—</span>;
  const usd = convertRubToUsd(rub, usdRate);
  return (
    <span
      className={cn(
        "block leading-tight",
        danger && "text-danger",
        emphasize && !danger && "font-semibold text-foreground"
      )}
    >
      <span className={cn("block", emphasize ? "text-sm font-semibold" : "font-medium")}>
        {formatCurrency(rub)}
      </span>
      <span className="block text-[10px] text-muted-foreground">
        {usd !== null
          ? `${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
          : "—"}
      </span>
    </span>
  );
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
  scopeBrandId,
  initialTargetMargin = DEFAULT_TARGET_MARGIN_PERCENT,
  initialMarketing = DEFAULT_MARKETING_PERCENT,
  initialCommissionSettings,
}: SmartPricingPanelProps) {
  const searchParams = useSearchParams();
  const urlBrandId = scopeBrandId ?? searchParams.get(FILTER_PARAMS.brand) ?? undefined;
  const urlScopedBrand = Boolean(urlBrandId);

  const [targetMargin, setTargetMargin] = useState(initialTargetMargin);
  const [marketing, setMarketing] = useState(initialMarketing);
  const [taxPercent, setTaxPercent] = useState(DEFAULT_TAX_PERCENT);
  const [usdExchangeRate, setUsdExchangeRate] = useState(DEFAULT_USD_EXCHANGE_RATE);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [commissionSettings, setCommissionSettings] = useState<SmartPricingCommissionSettings>(
    initialCommissionSettings ?? DEFAULT_SMART_PRICING_COMMISSION_SETTINGS
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState(
    () => searchParams.get(PRODUCT_INTEL_NAV_PARAMS.sku) ?? ""
  );
  const [brandFilter, setBrandFilter] = useState(urlBrandId ?? "all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [onlyIncreaseOver20, setOnlyIncreaseOver20] = useState(false);
  const [onlyHighVolume, setOnlyHighVolume] = useState(false);
  const [explainRow, setExplainRow] = useState<SmartPricingComputedRow | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(() => {
    const productId = searchParams.get(PRODUCT_INTEL_NAV_PARAMS.product)?.trim();
    if (productId && inputs.some((row) => row.productId === productId)) return productId;
    return null;
  });
  const [testPriceOverrides, setTestPriceOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    setSearch(searchParams.get(PRODUCT_INTEL_NAV_PARAMS.sku) ?? "");
    const productId = searchParams.get(PRODUCT_INTEL_NAV_PARAMS.product)?.trim();
    if (productId && inputs.some((row) => row.productId === productId)) {
      setExpandedProductId(productId);
    }
  }, [searchParams, inputs]);

  // Keep panel brand dropdown aligned with header Brand Filter (URL).
  // When URL scopes a brand, server `inputs` are already filtered — lock the dropdown.
  useEffect(() => {
    setBrandFilter(urlBrandId ?? "all");
  }, [urlBrandId]);

  useEffect(() => {
    const saved = loadSmartPricingUiSettings();
    setTargetMargin(saved.targetMarginPercent);
    setMarketing(saved.marketingPercent);
    setTaxPercent(saved.taxPercent);
    setUsdExchangeRate(saved.usdExchangeRate);
    setSettingsHydrated(true);
  }, []);

  useEffect(() => {
    if (!settingsHydrated) return;
    saveSmartPricingUiSettings({
      targetMarginPercent: targetMargin,
      marketingPercent: marketing,
      taxPercent,
      usdExchangeRate,
    });
  }, [targetMargin, marketing, taxPercent, usdExchangeRate, settingsHydrated]);

  const volumeCutoff = useMemo(() => highVolumeThreshold(inputs), [inputs]);

  const brandOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of inputs) {
      map.set(row.brandId, row.brandName);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inputs]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of inputs) {
      map.set(row.categoryId, row.categoryName);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inputs]);

  const rows = useMemo(() => {
    const adjusted = inputs.map((row) =>
      applySmartPricingCommissionSettings(row, commissionSettings)
    );
    return adjusted.map((row) =>
      buildSmartPricingRow(row, targetMargin, marketing, taxPercent)
    );
  }, [inputs, commissionSettings, targetMargin, marketing, taxPercent]);

  const summary = useMemo(() => {
    const missingCost = inputs.filter((row) => row.purchaseCost === null).length;
    return {
      productsInStock: inputs.length,
      missingProductCost: missingCost,
    };
  }, [inputs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (brandFilter !== "all" && row.brandId !== brandFilter) return false;
      if (categoryFilter !== "all" && row.categoryId !== categoryFilter) return false;
      if (q) {
        const matchesSearch =
          row.supplierArticle.toLowerCase().includes(q) ||
          row.productName.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (onlyIncreaseOver20 && (row.differencePercent ?? 0) <= 20) return false;
      if (onlyHighVolume && row.orders < volumeCutoff) return false;
      return true;
    });
  }, [
    rows,
    search,
    brandFilter,
    categoryFilter,
    onlyIncreaseOver20,
    onlyHighVolume,
    volumeCutoff,
  ]);

  const { sort, onSort, directionFor, isActive } = useCycleSort<PricingSortKey>(null);
  const getSortValue = useCallback(
    (row: SmartPricingComputedRow, key: PricingSortKey) =>
      pricingSortValue(row, key, testPriceOverrides, marketing, taxPercent),
    [testPriceOverrides, marketing, taxPercent]
  );
  const sortedFiltered = useMemo(
    () => sortRowsBySpec(filtered, sort, getSortValue),
    [filtered, sort, getSortValue]
  );

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
    <div className="space-y-3">
      {/* Sticky decision toolbar */}
      <div className="sticky top-20 z-30 space-y-2 border-b border-border/80 bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:top-[4.75rem]">
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          {/* Row: Brand / Category / Search */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            <label className="space-y-1.5">
              <span className={labelClass}>
                Brand{urlScopedBrand ? " (header)" : ""}
              </span>
              <select
                value={brandFilter}
                onChange={(event) => setBrandFilter(event.target.value)}
                disabled={urlScopedBrand}
                title={
                  urlScopedBrand
                    ? "Driven by header Brand Filter — clear header brand to filter here"
                    : undefined
                }
                className={fieldClass}
              >
                <option value="all">All Brands</option>
                {brandOptions.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className={labelClass}>Category</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className={fieldClass}
              >
                <option value="all">All Categories</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 space-y-1.5 md:col-span-2 lg:col-span-2 xl:col-span-2">
              <span className={labelClass}>Search</span>
              <input
                type="search"
                placeholder="Model or product…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={fieldClass}
              />
            </label>

            <label className="space-y-1.5">
              <span className={labelClass}>Target Margin %</span>
              <input
                type="number"
                min={1}
                max={80}
                step={1}
                value={targetMargin}
                onChange={(event) =>
                  setTargetMargin(Number(event.target.value) || DEFAULT_TARGET_MARGIN_PERCENT)
                }
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className={labelClass}>Marketing %</span>
              <input
                type="number"
                min={0}
                max={50}
                step={1}
                value={marketing}
                onChange={(event) => setMarketing(Number(event.target.value) || 0)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className={labelClass}>Tax Rate %</span>
              <input
                type="number"
                min={0}
                max={50}
                step={0.1}
                value={taxPercent}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  setTaxPercent(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
                }}
                className={fieldClass}
                title="Tax = Tax% × (Sale − Marketplace Fee). Default 6%."
              />
            </label>
            <label className="space-y-1.5">
              <span className={labelClass}>USD Rate</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={usdExchangeRate || ""}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  setUsdExchangeRate(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
                }}
                className={fieldClass}
                title="Display only"
              />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-card-hover"
            >
              Settings{settingsOpen ? " ▴" : " ▾"}
            </button>
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
            <div className="ml-auto flex flex-wrap items-center gap-4 text-sm">
              <div>
                <span className="text-[11px] text-muted-foreground">Products in Stock</span>
                <p className="font-semibold tabular-nums leading-tight">{summary.productsInStock}</p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">Missing Product Cost</span>
                <p
                  className={cn(
                    "font-semibold tabular-nums leading-tight",
                    summary.missingProductCost > 0 && "text-danger"
                  )}
                >
                  {summary.missingProductCost}
                </p>
              </div>
            </div>
          </div>

          {settingsOpen ? (
            <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className={labelClass}>Minimum Product Sales</span>
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
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Minimum Category Sales</span>
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
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Commission History Window</span>
                <select
                  value={commissionSettings.commissionWindow}
                  onChange={(event) =>
                    setCommissionSettings((current) => ({
                      ...current,
                      commissionWindow:
                        event.target.value as SmartPricingCommissionSettings["commissionWindow"],
                    }))
                  }
                  className={fieldClass}
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
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">Profit Simulator</span>
          <QuickActionButton label="+5%" onClick={() => adjustVisibleTestPrices(5)} />
          <QuickActionButton label="+10%" onClick={() => adjustVisibleTestPrices(10)} />
          <QuickActionButton label="-5%" onClick={() => adjustVisibleTestPrices(-5)} />
          <QuickActionButton label="-10%" onClick={() => adjustVisibleTestPrices(-10)} />
          <button
            type="button"
            onClick={resetAllTestPrices}
            className="ml-auto h-8 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-card-hover"
          >
            Reset All
          </button>
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
        <div className="max-h-[min(78vh,1100px)] overflow-auto">
          <table
            className="w-full border-collapse text-sm"
            style={{ minWidth: DECISION_MIN_WIDTH + SCROLL_TAIL_MIN }}
          >
            <thead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                <SortableTh
                  label="Model"
                  active={isActive("model")}
                  direction={directionFor("model")}
                  onClick={() => onSort("model")}
                  align="left"
                  className={stickyHeader(0)}
                  style={{
                    left: STICKY_LEFT[0],
                    minWidth: STICKY_COLS[0].width,
                    width: STICKY_COLS[0].width,
                  }}
                />
                <SortableTh
                  label="Avg Sell"
                  active={isActive("avgSell")}
                  direction={directionFor("avgSell")}
                  onClick={() => onSort("avgSell")}
                  align="right"
                  className={stickyHeader(1)}
                  style={{
                    left: STICKY_LEFT[1],
                    minWidth: STICKY_COLS[1].width,
                    width: STICKY_COLS[1].width,
                  }}
                />
                <SortableTh
                  label="Comm %"
                  active={isActive("commission")}
                  direction={directionFor("commission")}
                  onClick={() => onSort("commission")}
                  align="right"
                  className={stickyHeader(2)}
                  style={{
                    left: STICKY_LEFT[2],
                    minWidth: STICKY_COLS[2].width,
                    width: STICKY_COLS[2].width,
                  }}
                />
                <SortableTh
                  label="Final Net Profit"
                  active={isActive("currentNp")}
                  direction={directionFor("currentNp")}
                  onClick={() => onSort("currentNp")}
                  align="right"
                  className={stickyHeader(3)}
                  style={{
                    left: STICKY_LEFT[3],
                    minWidth: STICKY_COLS[3].width,
                    width: STICKY_COLS[3].width,
                  }}
                />
                <SortableTh
                  label="Final Margin"
                  active={isActive("currentMargin")}
                  direction={directionFor("currentMargin")}
                  onClick={() => onSort("currentMargin")}
                  align="right"
                  className="whitespace-nowrap px-1.5 py-2"
                />
                <SortableTh
                  label="Markup"
                  active={isActive("markup")}
                  direction={directionFor("markup")}
                  onClick={() => onSort("markup")}
                  align="right"
                  className="whitespace-nowrap px-1.5 py-2"
                />
                <SortableTh
                  label="15%"
                  active={isActive("m15")}
                  direction={directionFor("m15")}
                  onClick={() => onSort("m15")}
                  align="right"
                  className="whitespace-nowrap px-1.5 py-2"
                />
                <SortableTh
                  label="20%"
                  active={isActive("m20")}
                  direction={directionFor("m20")}
                  onClick={() => onSort("m20")}
                  align="right"
                  className="whitespace-nowrap px-1.5 py-2"
                />
                <SortableTh
                  label="Recommended"
                  active={isActive("recommended")}
                  direction={directionFor("recommended")}
                  onClick={() => onSort("recommended")}
                  align="right"
                  className="whitespace-nowrap px-1.5 py-2 text-primary"
                />
                <SortableTh
                  label="Test Price"
                  active={isActive("testPrice")}
                  direction={directionFor("testPrice")}
                  onClick={() => onSort("testPrice")}
                  align="right"
                  className="whitespace-nowrap px-1.5 py-2"
                />
                <SortableTh
                  label="Risk"
                  active={isActive("risk")}
                  direction={directionFor("risk")}
                  onClick={() => onSort("risk")}
                  align="left"
                  className="whitespace-nowrap px-2 py-2"
                />
                <SortableTh
                  label="Test NP"
                  active={isActive("testNp")}
                  direction={directionFor("testNp")}
                  onClick={() => onSort("testNp")}
                  align="right"
                  className="whitespace-nowrap px-2 py-2"
                />
                <SortableTh
                  label="Test Margin"
                  active={isActive("testMargin")}
                  direction={directionFor("testMargin")}
                  onClick={() => onSort("testMargin")}
                  align="right"
                  className="whitespace-nowrap px-2 py-2"
                />
                <SortableTh
                  label="Diff vs Rec."
                  active={isActive("diffVsRec")}
                  direction={directionFor("diffVsRec")}
                  onClick={() => onSort("diffVsRec")}
                  align="right"
                  className="whitespace-nowrap px-2 py-2"
                />
                <SortableTh
                  label="Simulator"
                  active={isActive("simulator")}
                  direction={directionFor("simulator")}
                  onClick={() => onSort("simulator")}
                  align="left"
                  className="whitespace-nowrap px-2 py-2"
                />
                <SortableTh
                  label="Δ ₽"
                  active={isActive("differenceRub")}
                  direction={directionFor("differenceRub")}
                  onClick={() => onSort("differenceRub")}
                  align="right"
                  className="whitespace-nowrap px-2 py-2"
                />
                <SortableTh
                  label="Δ %"
                  active={isActive("differencePercent")}
                  direction={directionFor("differencePercent")}
                  onClick={() => onSort("differencePercent")}
                  align="right"
                  className="whitespace-nowrap px-2 py-2"
                />
                <SortableTh
                  label="Cost Multiplier (×)"
                  active={isActive("costMultiplier")}
                  direction={directionFor("costMultiplier")}
                  onClick={() => onSort("costMultiplier")}
                  align="right"
                  className="whitespace-nowrap px-2 py-2"
                />
                <th className="whitespace-nowrap px-2 py-2 text-center font-medium">Explain</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={19} className="px-3 py-8 text-center text-muted-foreground">
                    No products match the current filters
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((row) => (
                  <PricingRow
                    key={row.productId}
                    row={row}
                    testPrice={resolveTestPrice(row, testPriceOverrides[row.productId])}
                    marketing={marketing}
                    taxPercent={taxPercent}
                    usdExchangeRate={usdExchangeRate}
                    expanded={expandedProductId === row.productId}
                    onToggleExpand={() =>
                      setExpandedProductId((prev) =>
                        prev === row.productId ? null : row.productId
                      )
                    }
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
        taxPercent={taxPercent}
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
      className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium hover:bg-card-hover"
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
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
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
  taxPercent,
  usdExchangeRate,
  expanded,
  onToggleExpand,
  onTestPriceChange,
  onExplain,
}: {
  row: SmartPricingComputedRow;
  testPrice: number | null;
  marketing: number;
  taxPercent: number;
  usdExchangeRate: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onTestPriceChange: (value: number | null) => void;
  onExplain: () => void;
}) {
  const simulation: SmartPricingSimulation | null = useMemo(() => {
    if (testPrice === null) return null;
    return computeSmartPricingSimulation(row, testPrice, marketing, taxPercent);
  }, [row, testPrice, marketing, taxPercent]);

  const diffVariant =
    row.differencePercent === null
      ? "muted"
      : row.differencePercent <= 0
        ? "success"
        : row.differencePercent > 20
          ? "danger"
          : "default";

  const missingCost = row.status === "missing-cost";
  const highlight = missingCost || (simulation?.isLoss ?? false);
  const rowHighlight = missingCost
    ? "bg-danger/10 hover:bg-danger/15"
    : simulation?.isLoss
      ? "bg-danger/10 hover:bg-danger/15"
      : undefined;

  const currentLoss = row.currentNetProfit !== null && row.currentNetProfit < 0;
  const canExpand = canExpandSmartPricingCostBreakdown(row);
  const isExpanded = expanded && canExpand;

  return (
    <Fragment>
    <tr
      className={cn(
        "group border-b border-border/50 transition-colors hover:bg-card-hover",
        rowHighlight,
        isExpanded && "border-b-0"
      )}
    >
      <td
        className={cn(stickyCell(0, highlight), "truncate")}
        style={{
          left: STICKY_LEFT[0],
          minWidth: STICKY_COLS[0].width,
          width: STICKY_COLS[0].width,
        }}
        title={row.productName}
      >
        <div className="flex min-w-0 items-center gap-0.5">
          {canExpand ? (
            <button
              type="button"
              className="inline-flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-card-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-expanded={isExpanded}
              aria-label={
                isExpanded
                  ? `Collapse cost breakdown for ${row.supplierArticle}`
                  : `Expand cost breakdown for ${row.supplierArticle}`
              }
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpand();
              }}
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-150",
                  isExpanded && "rotate-90"
                )}
                aria-hidden
              />
            </button>
          ) : (
            <span className="inline-block w-5 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 truncate font-mono text-xs font-medium text-foreground">
            {row.supplierArticle}
          </span>
        </div>
      </td>
      <td
        className={stickyCell(1, highlight)}
        style={{
          left: STICKY_LEFT[1],
          minWidth: STICKY_COLS[1].width,
          width: STICKY_COLS[1].width,
        }}
      >
        {row.currentAvgPrice !== null ? formatCurrency(row.currentAvgPrice) : "—"}
      </td>
      <td
        className={stickyCell(2, highlight)}
        style={{
          left: STICKY_LEFT[2],
          minWidth: STICKY_COLS[2].width,
          width: STICKY_COLS[2].width,
        }}
      >
        {missingCost ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="font-medium">{formatPercent(row.commissionPercent)}</span>
        )}
      </td>
      <td
        className={stickyCell(3, highlight)}
        style={{
          left: STICKY_LEFT[3],
          minWidth: STICKY_COLS[3].width,
          width: STICKY_COLS[3].width,
        }}
      >
        <MoneyRubUsd
          rub={row.currentNetProfit}
          usdRate={usdExchangeRate}
          danger={currentLoss}
          emphasize
        />
      </td>
      <td
        className={cn(
          "px-1.5 py-1.5 text-right tabular-nums",
          currentLoss && "text-danger"
        )}
      >
        {row.currentMarginPercent !== null ? formatPercent(row.currentMarginPercent) : "—"}
      </td>
      <td
        className={cn(
          "px-1.5 py-1.5 text-right tabular-nums",
          currentLoss && "text-danger"
        )}
      >
        {row.currentMarkupOnCostPercent !== null
          ? formatPercent(row.currentMarkupOnCostPercent)
          : "—"}
      </td>
      <td className="px-1.5 py-1.5 text-right tabular-nums">{formatPrice(row.priceFor15)}</td>
      <td className="px-1.5 py-1.5 text-right tabular-nums">{formatPrice(row.priceFor20)}</td>
      <td className="px-1.5 py-1.5 text-right">
        <span className="text-base font-bold tabular-nums text-primary">
          {formatPrice(row.targetPrice)}
        </span>
      </td>
      <td className="px-1.5 py-1.5 text-right">
        <TestPriceInput
          value={testPrice}
          disabled={row.targetPrice === null}
          onChange={onTestPriceChange}
        />
      </td>
      <td className="px-2 py-1.5">
        {missingCost ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <RiskScoreCell row={row} />
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <MoneyRubUsd
          rub={simulation?.netProfit ?? null}
          usdRate={usdExchangeRate}
          danger={simulation?.isLoss}
        />
      </td>
      <td
        className={cn(
          "px-2 py-1.5 text-right tabular-nums",
          simulation?.isLoss && "text-danger"
        )}
      >
        {simulation ? formatPercent(simulation.profitMarginPercent) : "—"}
      </td>
      <td
        className={cn(
          "px-2 py-1.5 text-right tabular-nums",
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
        {simulation?.differenceVsRecommended === null ||
        simulation?.differenceVsRecommended === undefined
          ? "—"
          : formatCurrency(simulation.differenceVsRecommended)}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-xs">
        {simulation ? simulation.comparisonLabel : "—"}
      </td>
      <td
        className={cn(
          "px-2 py-1.5 text-right tabular-nums",
          diffVariant === "success" && "text-success",
          diffVariant === "danger" && "text-danger",
          diffVariant === "muted" && "text-muted-foreground"
        )}
      >
        {row.differenceRub === null ? "—" : formatCurrency(row.differenceRub)}
      </td>
      <td
        className={cn(
          "px-2 py-1.5 text-right tabular-nums",
          diffVariant === "success" && "text-success",
          diffVariant === "danger" && "text-danger",
          diffVariant === "muted" && "text-muted-foreground"
        )}
      >
        {row.differencePercent === null ? "—" : formatPercent(row.differencePercent)}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-xs">
        {formatCostMultiplier(row.currentAvgPrice, row.purchaseCost)}
      </td>
      <td className="px-2 py-1.5 text-center">
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
    {isExpanded ? (
      <tr className="border-b border-border/50 bg-muted/20">
        <td colSpan={19} className="px-3 py-3 pl-8">
          <SmartPricingCostBreakdownDetail
            row={row}
            marketingPercent={marketing}
            taxPercent={taxPercent}
          />
        </td>
      </tr>
    ) : null}
    </Fragment>
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
      className="h-8 w-[5.5rem] rounded-lg border border-border bg-background px-1.5 text-right text-sm tabular-nums"
      aria-label="Test price"
    />
  );
}
