"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Coins,
  LineChart,
  Receipt,
  Tag,
  X,
  type LucideIcon,
} from "lucide-react";
import { ProductHeroImage } from "@/components/inventory/product-hero-image";
import { StockHealthBadge } from "@/components/inventory/stock-health-badge";
import { WarehouseDistributionPanel } from "@/components/inventory/warehouse-distribution-panel";
import { totalsFromDistribution } from "@/lib/inventory-intelligence-excel";
import type { InventoryIntelligenceSkuRow } from "@/lib/inventory-intelligence-types";
import { buildProductIntelligenceQuickActions } from "@/lib/product-intelligence-nav";
import { cn, formatCurrency, formatDate, formatNumber } from "@/lib/utils";

type ProductIntelligenceDrawerProps = {
  row: InventoryIntelligenceSkuRow | null;
  onClose: () => void;
};

/**
 * Right-side Product Intelligence drawer (Sprint 6.46.4; Quick Actions footer 6.46.5).
 * Presentation only — all metrics from the existing SKU intelligence DTO /
 * warehouseDistribution aggregates (same as table + Excel export).
 *
 * Future sections (not implemented): Estimated Cover, Shipment History, etc.
 */
const QUICK_ACTION_ICONS: LucideIcon[] = [LineChart, Tag, Receipt, Coins];

export function ProductIntelligenceDrawer({ row, onClose }: ProductIntelligenceDrawerProps) {
  const titleId = useId();
  const searchParams = useSearchParams();
  const [entered, setEntered] = useState(false);

  const quickActions = useMemo(() => {
    if (!row) return [];
    return buildProductIntelligenceQuickActions(searchParams, {
      sku: row.sku,
      productId: row.productId,
      nmId: row.nmId,
      productName: row.productName,
    });
  }, [row, searchParams]);

  useEffect(() => {
    if (!row) {
      setEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [row]);

  useEffect(() => {
    if (!row) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [row, onClose]);

  if (!row) return null;

  const sales = totalsFromDistribution(row);

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        aria-label="Close product intelligence"
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-300",
          entered ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-out",
          entered ? "translate-x-0" : "translate-x-full"
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Product Intelligence
            </p>
            <h2
              id={titleId}
              className="mt-0.5 truncate font-mono text-sm font-semibold text-foreground"
            >
              {row.sku}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-6">
            <ProductHeaderSection row={row} />
            <InventorySummarySection row={row} />
            <SalesSummarySection
              orders={sales.orders}
              units={sales.units}
              revenue={sales.revenue}
            />
            <section aria-labelledby="pi-warehouse-heading">
              <h3 id="pi-warehouse-heading" className="sr-only">
                Warehouse Distribution
              </h3>
              <WarehouseDistributionPanel
                rows={row.warehouseDistribution}
                sku={row.sku}
                compactTitle
              />
            </section>

            {/* Future Product 360° sections (do not implement in 6.46.4):
                - Estimated Cover
                - Shipment History
                - Pricing / Margin
                - Alerts */}
          </div>
        </div>

        <footer className="shrink-0 border-t border-border px-5 py-4">
          <QuickActionsSection actions={quickActions} onNavigate={onClose} />
        </footer>
      </aside>
    </div>
  );
}

function QuickActionsSection({
  actions,
  onNavigate,
}: {
  actions: { label: string; href: string }[];
  onNavigate: () => void;
}) {
  return (
    <section aria-labelledby="pi-quick-actions-heading">
      <h3
        id="pi-quick-actions-heading"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Quick Actions
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map((action, index) => {
          const Icon = QUICK_ACTION_ICONS[index] ?? LineChart;
          return (
            <Link
              key={action.href}
              href={action.href}
              onClick={onNavigate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-card-hover hover:text-foreground"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{action.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ProductHeaderSection({ row }: { row: InventoryIntelligenceSkuRow }) {
  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-start" aria-label="Product">
      <ProductHeroImage
        key={row.productId}
        nmId={row.nmId}
        alt={row.productName || row.sku}
      />
      <dl className="min-w-0 flex-1 space-y-3 text-sm">
        <InfoRow label="SKU" value={row.sku} mono />
        <InfoRow label="Product Name" value={row.productName || "—"} />
        <InfoRow label="Brand" value={row.brandName || "—"} />
        <InfoRow label="Category" value={row.categoryName || "—"} />
      </dl>
    </section>
  );
}

function InventorySummarySection({ row }: { row: InventoryIntelligenceSkuRow }) {
  return (
    <section aria-labelledby="pi-inventory-heading">
      <SectionHeading id="pi-inventory-heading">Inventory</SectionHeading>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <MetricTile label="Current Stock" value={formatNumber(row.currentStock)} />
        <MetricTile label="Warehouse Count" value={formatNumber(row.warehouseCount)} />
        <MetricTile
          label="Stock Health"
          valueNode={<StockHealthBadge status={row.stockHealth} />}
        />
        <MetricTile
          label="Last Sale Date"
          value={row.lastSaleDate ? formatDate(row.lastSaleDate) : "—"}
        />
        <MetricTile
          label="Days Since Last Sale"
          value={
            row.daysSinceLastSale == null ? "—" : formatNumber(row.daysSinceLastSale)
          }
          className="col-span-2 sm:col-span-1"
        />
      </dl>
    </section>
  );
}

function SalesSummarySection({
  orders,
  units,
  revenue,
}: {
  orders: number;
  units: number;
  revenue: number;
}) {
  return (
    <section aria-labelledby="pi-sales-heading">
      <SectionHeading id="pi-sales-heading">Sales Summary</SectionHeading>
      <p className="mt-1 text-xs text-muted-foreground">
        Period totals from warehouse distribution (same as table / export)
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <MetricTile label="Total Orders" value={formatNumber(orders)} />
        <MetricTile label="Total Units Sold" value={formatNumber(units)} />
        <MetricTile label="Total Revenue" value={formatCurrency(revenue)} />
      </dl>
    </section>
  );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 break-words text-foreground",
          mono && "font-mono text-xs font-medium"
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function MetricTile({
  label,
  value,
  valueNode,
  className,
}: {
  label: string;
  value?: string;
  valueNode?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-background px-3 py-2.5", className)}>
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">
        {valueNode ?? value}
      </dd>
    </div>
  );
}
