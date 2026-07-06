"use client";

import { useState } from "react";
import {
  formatDaysLeft,
  InventoryStatusBadge,
} from "@/components/inventory/inventory-status-badge";
import type { InventoryModelDetail } from "@/lib/inventory-types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

type TabId = "overview" | "sku" | "warehouses" | "history";

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "sku", label: "SKU" },
  { id: "warehouses", label: "Warehouses" },
  { id: "history", label: "History" },
];

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function OverviewTab({ detail }: { detail: InventoryModelDetail }) {
  const { overview } = detail;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <InventoryStatusBadge status={overview.status} />
        <span className="text-xs text-muted-foreground">Model operational status</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Current Stock" value={formatNumber(overview.currentStock)} />
        <MetricCard label="Available Stock" value={formatNumber(overview.availableStock)} />
        <MetricCard label="Reserved Stock" value={formatNumber(overview.reservedStock)} />
        <MetricCard label="30 Day Sales" value={formatNumber(overview.purchases30Day)} />
        <MetricCard
          label="Daily Sales"
          value={overview.dailySales > 0 ? overview.dailySales.toFixed(2) : "0"}
        />
        <MetricCard label="Days Left" value={formatDaysLeft(overview.daysLeft)} />
        <MetricCard
          label="Last Sync"
          value={overview.lastSync ? formatDate(overview.lastSync) : "—"}
        />
      </div>
    </div>
  );
}

function SkuTab({ detail }: { detail: InventoryModelDetail }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Size</th>
            <th className="px-3 py-2 text-right font-medium">Current Stock</th>
            <th className="px-3 py-2 text-right font-medium">Available Stock</th>
            <th className="px-3 py-2 text-right font-medium">Reserved Stock</th>
            <th className="px-3 py-2 text-right font-medium">30 Day Sales</th>
            <th className="px-3 py-2 text-right font-medium">Daily Sales</th>
            <th className="px-3 py-2 text-right font-medium">Days Left</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {detail.skus.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                No SKU stock rows for this model
              </td>
            </tr>
          ) : (
            detail.skus.map((sku) => (
              <tr key={sku.size} className="border-b border-border/50">
                <td className="px-3 py-2.5 font-medium">{sku.size}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(sku.currentStock)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatNumber(sku.availableStock)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatNumber(sku.reservedStock)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatNumber(sku.purchases30Day)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {sku.dailySales > 0 ? sku.dailySales.toFixed(2) : "0"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatDaysLeft(sku.daysLeft)}
                </td>
                <td className="px-3 py-2.5">
                  <InventoryStatusBadge status={sku.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function WarehousesTab({ detail }: { detail: InventoryModelDetail }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Warehouse</th>
            <th className="px-3 py-2 text-right font-medium">Current Stock</th>
            <th className="px-3 py-2 text-right font-medium">Available Stock</th>
            <th className="px-3 py-2 text-right font-medium">Reserved Stock</th>
          </tr>
        </thead>
        <tbody>
          {detail.warehouses.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                No warehouse stock rows for this model
              </td>
            </tr>
          ) : (
            detail.warehouses.map((row) => (
              <tr key={row.warehouse} className="border-b border-border/50">
                <td className="px-3 py-2.5 font-medium">{row.warehouse}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.currentStock)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatNumber(row.availableStock)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatNumber(row.reservedStock)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTab({ detail }: { detail: InventoryModelDetail }) {
  return (
    <div className="space-y-3">
      {detail.history.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No history entries yet</p>
      ) : (
        detail.history.map((entry) => (
          <div
            key={entry.id}
            className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{entry.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{formatDate(entry.occurredAt)}</p>
              {entry.quantity !== undefined && (
                <p className="mt-0.5 tabular-nums">{formatNumber(entry.quantity)} units</p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function InventoryModelDetailPanel({ detail }: { detail: InventoryModelDetail | null }) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  if (!detail) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-border bg-card p-8 text-center">
        <div>
          <p className="text-sm font-medium">Select a model</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a model from the list to view stock overview, SKU breakdown, warehouses, and
            history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card">
      <div className="shrink-0 border-b border-border px-5 py-4">
        <p className="font-mono text-sm font-semibold text-primary">{detail.supplierArticle}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{detail.productName}</p>
      </div>

      <div className="shrink-0 border-b border-border px-5">
        <div className="flex gap-1 overflow-x-auto py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-card-hover hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {activeTab === "overview" && <OverviewTab detail={detail} />}
        {activeTab === "sku" && <SkuTab detail={detail} />}
        {activeTab === "warehouses" && <WarehousesTab detail={detail} />}
        {activeTab === "history" && <HistoryTab detail={detail} />}
      </div>
    </div>
  );
}
