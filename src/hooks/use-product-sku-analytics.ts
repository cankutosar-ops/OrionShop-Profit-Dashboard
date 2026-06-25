"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProductSkuAnalyticsResponse } from "@/types/database";

async function fetchProductSkuAnalytics(
  productId: string,
  from: string,
  to: string
): Promise<ProductSkuAnalyticsResponse> {
  const params = new URLSearchParams({ from, to });
  const response = await fetch(`/api/analytics/products/${productId}/skus?${params.toString()}`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load SKU analytics");
  }

  return response.json();
}

export function useProductSkuAnalytics(
  productId: string | null,
  from: string,
  to: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["product-sku-analytics", productId, from, to],
    queryFn: () => fetchProductSkuAnalytics(productId!, from, to),
    enabled: Boolean(productId && enabled),
  });
}
