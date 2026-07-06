"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { copyScopeQueryParams } from "@/lib/filter-params";
import type { ProductSkuAnalyticsResponse } from "@/types/database";

async function fetchProductSkuAnalytics(
  productId: string,
  scopeQuery: string
): Promise<ProductSkuAnalyticsResponse> {
  const response = await fetch(`/api/analytics/products/${productId}/skus?${scopeQuery}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Failed to load SKU analytics");
  return data;
}

export function useProductSkuAnalytics(
  productId: string | null | undefined,
  from: string,
  to: string,
  enabled = true
) {
  const searchParams = useSearchParams();
  const scopeQuery = (() => {
    const params = new URLSearchParams({ from, to });
    copyScopeQueryParams(params, searchParams);
    params.set("from", from);
    params.set("to", to);
    return params.toString();
  })();

  return useQuery({
    queryKey: ["product-sku-analytics", productId, scopeQuery],
    queryFn: () => fetchProductSkuAnalytics(productId!, scopeQuery),
    enabled: Boolean(productId && searchParams.get("account") && enabled),
  });
}
