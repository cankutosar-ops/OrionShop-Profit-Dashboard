"use client";

import { useMemo, useState } from "react";
import {
  buildSmartPricingRow,
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  PRICING_V3_STATUS_LABEL,
  type ProductPricingHistoricalInputs,
  type SmartPricingComputedRow,
  type SmartPricingStatus,
} from "@/lib/smart-pricing";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type SmartPricingPanelProps = {
  inputs: ProductPricingHistoricalInputs[];
  initialTargetMargin?: number;
  initialMarketing?: number;
};

const STATUS_ORDER: Record<SmartPricingStatus, number> = {
  unrealistic: 4,
  difficult: 3,
  "small-increase": 2,
  profitable: 1,
  infeasible: 5,
  "no-data": 0,
};

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return formatCurrency(value);
}

function highVolumeThreshold(rows: ProductPricingHistoricalInputs[]): number {
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
}: SmartPricingPanelProps) {
  const [targetMargin, setTargetMargin] = useState(initialTargetMargin);
  const [marketing, setMarketing] = useState(initialMarketing);
  const [search, setSearch] = useState("");
  const [onlyLosing, setOnlyLosing] = useState(false);
  const [onlyIncreaseOver20, setOnlyIncreaseOver20] = useState(false);
  const [onlyHighVolume, setOnlyHighVolume] = useState(false);

  const volumeCutoff = useMemo(() => highVolumeThreshold(inputs), [inputs]);

  const rows = useMemo(
    () => inputs.map((row) => buildSmartPricingRow(row, targetMargin, marketing)),
    [inputs, targetMargin, marketing]
  );

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

        if (onlyLosing && row.currentOperationalMarginPercent >= 0) return false;

        if (onlyIncreaseOver20 && (row.differencePercent ?? 0) <= 20) return false;

        if (onlyHighVolume && row.orders < volumeCutoff) return false;

        return true;
      })
      .sort((a, b) => {
        const statusCmp = STATUS_ORDER[b.status] - STATUS_ORDER[a.status];
        if (statusCmp !== 0) return statusCmp;
        return (b.differencePercent ?? -999) - (a.differencePercent ?? -999);
      });
  }, [rows, search, onlyLosing, onlyIncreaseOver20, onlyHighVolume, volumeCutoff]);

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
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <FilterToggle
            label="Only losing products"
            checked={onlyLosing}
            onChange={setOnlyLosing}
          />
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

      <div className="w-full overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 text-right font-medium">Average Selling Price</th>
                <th className="px-3 py-2 text-right font-medium">20%</th>
                <th className="px-3 py-2 text-right font-medium">25%</th>
                <th className="px-3 py-2 text-right font-medium">30%</th>
                <th className="px-3 py-2 text-right font-medium">35%</th>
                <th className="px-3 py-2 text-right font-medium">Recommended Price</th>
                <th className="px-3 py-2 text-right font-medium">Difference (₽)</th>
                <th className="px-3 py-2 text-right font-medium">Difference (%)</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    No products match the current filters
                  </td>
                </tr>
              ) : (
                filtered.map((row) => <PricingRow key={row.productId} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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

function PricingRow({ row }: { row: SmartPricingComputedRow }) {
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
      <td className="px-3 py-2 font-mono text-xs font-medium text-primary" title={row.productName}>
        {row.supplierArticle}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {row.hasSalesHistory ? formatCurrency(row.currentAvgPrice) : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.priceFor20)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.priceFor25)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.priceFor30)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPrice(row.priceFor35)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-medium text-primary">
        {formatPrice(row.targetPrice)}
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
    </tr>
  );
}
