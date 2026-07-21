"use client";

import { useEffect, useState } from "react";
import {
  formatDaysLeft,
  InventoryStatusBadge,
} from "@/components/inventory/inventory-status-badge";
import type { InventoryShipmentEntry } from "@/lib/inventory-shipment-history";
import type { InventoryModelDetail } from "@/lib/inventory-types";
import { formatWarehouseName } from "@/lib/warehouse-name-aliases";
import { MetricCard } from "@/components/dashboard/metric-card";
import { formatKpiCount } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import { cn, formatDate, formatNumber } from "@/lib/utils";

type TabId = "overview" | "sku" | "warehouses" | "history";

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "sku", label: "SKU" },
  { id: "warehouses", label: "Warehouses" },
  { id: "history", label: "History" },
];

function OverviewTab({ detail }: { detail: InventoryModelDetail }) {
  const { overview } = detail;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <InventoryStatusBadge status={overview.status} />
        <span className="text-xs text-muted-foreground">Model operational status</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          size="compact"
          title="Current Stock"
          value={formatKpiCount(overview.currentStock)}
          icon={KPI_ICONS.inventory}
        />
        <MetricCard
          size="compact"
          title="Available Stock"
          value={formatKpiCount(overview.availableStock)}
          icon={KPI_ICONS.inventory}
        />
        <MetricCard
          size="compact"
          title="Reserved Stock"
          value={formatKpiCount(overview.reservedStock)}
          icon={KPI_ICONS.storage}
        />
        <MetricCard
          size="compact"
          title="30 Day Sales"
          value={formatKpiCount(overview.purchases30Day)}
          icon={KPI_ICONS.purchases}
        />
        <MetricCard
          size="compact"
          title="Daily Sales"
          value={overview.dailySales > 0 ? overview.dailySales.toFixed(2) : "0"}
          icon={KPI_ICONS.purchases}
        />
        <MetricCard
          size="compact"
          title="Days Left"
          value={formatDaysLeft(overview.daysLeft)}
          icon={KPI_ICONS.inventory}
        />
        <MetricCard
          size="compact"
          title="Last Sync"
          value={overview.lastSync ? formatDate(overview.lastSync) : "—"}
          icon={KPI_ICONS.inventory}
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
              <tr key={`${sku.size}-${sku.barcode ?? ""}`} className="border-b border-border/50">
                <td className="px-3 py-2.5 font-medium">{sku.size}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatNumber(sku.currentStock)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatNumber(sku.availableStock)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatNumber(sku.reservedStock)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
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
                <td className="px-3 py-2.5 font-medium">
                  {formatWarehouseName(row.warehouse)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatNumber(row.currentStock)}
                </td>
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

function ShipmentHistoryTab({
  productId,
  marketplaceAccountId,
}: {
  productId: string;
  marketplaceAccountId: string;
}) {
  const [shipments, setShipments] = useState<InventoryShipmentEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      setShipments(null);

      try {
        const params = new URLSearchParams({
          marketplaceAccountId,
          productId,
        });
        const response = await fetch(`/api/inventory/shipment-history?${params}`, {
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as {
          shipments?: InventoryShipmentEntry[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(body.error || `HTTP ${response.status}`);
        }

        if (!cancelled) {
          setShipments(body.shipments ?? []);
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Failed to load shipment history");
        setShipments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [marketplaceAccountId, productId]);

  if (loading) {
    return (
      <div className="space-y-1 py-8 text-center">
        <p className="text-sm text-muted-foreground">Loading inbound shipment history…</p>
        <p className="text-xs text-muted-foreground">
          First load per account may take up to a couple of minutes (WB Supplies rate limits).
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2 py-6 text-center">
        <p className="text-sm font-medium text-foreground">Shipment history unavailable</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <p className="text-xs text-muted-foreground">
          Requires a Wildberries API token with the Supplies category.
        </p>
      </div>
    );
  }

  if (!shipments?.length) {
    return (
      <div className="space-y-1 py-8 text-center">
        <p className="text-sm text-muted-foreground">No inbound shipments found for this model</p>
        <p className="text-xs text-muted-foreground">
          Shows warehouse receipts from Wildberries FBW supplies only — not sales or stock
          snapshots.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Inbound warehouse shipments (newest first) — quantity received at WB warehouses.
      </p>
      {shipments.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {formatWarehouseName(entry.warehouse)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[
                entry.supplyId != null ? `Supply ${entry.supplyId}` : null,
                entry.status,
              ]
                .filter(Boolean)
                .join(" · ") || "Inbound shipment"}
            </p>
          </div>
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <p>{formatDate(entry.shipmentDate)}</p>
            <p className="mt-0.5 tabular-nums text-sm font-medium text-foreground">
              {formatNumber(entry.quantityReceived)} received
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function InventoryModelDetailPanel({
  detail,
  marketplaceAccountId,
}: {
  detail: InventoryModelDetail | null;
  marketplaceAccountId: string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  if (!detail) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-border bg-card p-8 text-center">
        <div>
          <p className="text-sm font-medium">Select a model</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a model from the list to view stock overview, SKU breakdown, warehouses, and
            shipment history.
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
        {activeTab === "history" && (
          <ShipmentHistoryTab
            productId={detail.productId}
            marketplaceAccountId={marketplaceAccountId}
          />
        )}
      </div>
    </div>
  );
}
