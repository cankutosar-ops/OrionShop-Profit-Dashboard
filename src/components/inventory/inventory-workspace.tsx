"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { InventoryModelDetailPanel } from "@/components/inventory/inventory-model-detail";
import { InventoryModelList } from "@/components/inventory/inventory-model-list";
import { MetricCard } from "@/components/dashboard/metric-card";
import { FILTER_PARAMS } from "@/lib/filter-params";
import type { InventoryReport } from "@/lib/inventory-types";
import { formatKpiCount } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import { formatLastSyncTimestamp } from "@/lib/marketplace-sync-date";

type InventoryWorkspaceProps = {
  report: InventoryReport;
  initialProductId: string | null;
};

export function InventoryWorkspace({
  report,
  initialProductId,
}: InventoryWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [categoryId, setCategoryId] = useState("");

  const brandId = searchParams.get(FILTER_PARAMS.brand) ?? "";

  // Reset category when company/account/brand scope changes (Brand options already cascade).
  const scopeKey = `${searchParams.get(FILTER_PARAMS.company) ?? ""}:${searchParams.get(FILTER_PARAMS.account) ?? ""}:${brandId}`;
  useEffect(() => {
    setCategoryId("");
  }, [scopeKey]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const model of report.models) {
      if (!model.categoryId) continue;
      if (!map.has(model.categoryId)) {
        map.set(model.categoryId, model.categoryName || model.categoryId);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [report.models]);

  const scopedModels = useMemo(() => {
    return report.models.filter((model) => {
      if (brandId && model.brandId !== brandId) return false;
      if (categoryId && model.categoryId !== categoryId) return false;
      return true;
    });
  }, [report.models, brandId, categoryId]);

  const summary = useMemo(() => {
    let totalUnits = 0;
    let lowStockModels = 0;
    let outOfStockModels = 0;

    for (const model of scopedModels) {
      totalUnits += model.currentStock;
      if (model.status === "Low Stock") lowStockModels += 1;
      if (model.status === "Out of Stock") outOfStockModels += 1;
    }

    return {
      totalModels: scopedModels.length,
      totalUnits,
      lowStockModels,
      outOfStockModels,
    };
  }, [scopedModels]);

  const selectedProductId = useMemo(() => {
    const fromUrl = searchParams.get("product");
    if (fromUrl && scopedModels.some((model) => model.productId === fromUrl)) {
      return fromUrl;
    }
    if (
      initialProductId &&
      scopedModels.some((model) => model.productId === initialProductId)
    ) {
      return initialProductId;
    }
    return scopedModels[0]?.productId ?? null;
  }, [searchParams, scopedModels, initialProductId]);

  const selectedDetail = selectedProductId
    ? (report.detailsByProductId[selectedProductId] ?? null)
    : null;

  const handleSelect = useCallback(
    (productId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("product", productId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const lastSyncLabel = report.accountLastSync
    ? formatLastSyncTimestamp(report.accountLastSync)
    : "Never";

  return (
    <div className="space-y-4">
      <InventoryFilters
        categoryOptions={categoryOptions}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        accountLastSync={report.accountLastSync}
      />

      <div
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
        role="group"
        aria-label="Inventory summary"
      >
        <MetricCard
          size="compact"
          title="Total Models"
          value={formatKpiCount(summary.totalModels)}
          icon={KPI_ICONS.units}
        />
        <MetricCard
          size="compact"
          title="Total Units"
          value={formatKpiCount(summary.totalUnits)}
          icon={KPI_ICONS.inventory}
        />
        <MetricCard
          size="compact"
          title="Low Stock Models"
          value={formatKpiCount(summary.lowStockModels)}
          icon={KPI_ICONS.inventory}
          variant="warning"
        />
        <MetricCard
          size="compact"
          title="Out of Stock Models"
          value={formatKpiCount(summary.outOfStockModels)}
          icon={KPI_ICONS.inventory}
          variant="danger"
        />
        <MetricCard
          size="compact"
          title="Last Inventory Sync"
          value={lastSyncLabel}
          icon={KPI_ICONS.inventory}
        />
      </div>

      <div className="grid h-[calc(100vh-14rem)] min-h-[560px] grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,38%)_minmax(0,1fr)]">
        <InventoryModelList
          models={scopedModels}
          selectedProductId={selectedProductId}
          onSelect={handleSelect}
        />
        <InventoryModelDetailPanel
          detail={selectedDetail}
          marketplaceAccountId={report.marketplaceAccountId}
        />
      </div>
    </div>
  );
}
