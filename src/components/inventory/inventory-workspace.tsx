"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InventoryModelDetailPanel } from "@/components/inventory/inventory-model-detail";
import { InventoryModelList } from "@/components/inventory/inventory-model-list";
import type { InventoryReport } from "@/lib/inventory-types";

type InventoryWorkspaceProps = {
  report: InventoryReport;
  initialProductId: string | null;
};

export function InventoryWorkspace({ report, initialProductId }: InventoryWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedProductId = useMemo(() => {
    const fromUrl = searchParams.get("product");
    if (fromUrl && report.detailsByProductId[fromUrl]) return fromUrl;
    if (initialProductId && report.detailsByProductId[initialProductId]) return initialProductId;
    return report.models[0]?.productId ?? null;
  }, [searchParams, report, initialProductId]);

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

  return (
    <div className="grid h-[calc(100vh-10rem)] min-h-[560px] grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,38%)_minmax(0,1fr)]">
      <InventoryModelList
        models={report.models}
        selectedProductId={selectedProductId}
        onSelect={handleSelect}
      />
      <InventoryModelDetailPanel detail={selectedDetail} />
    </div>
  );
}
