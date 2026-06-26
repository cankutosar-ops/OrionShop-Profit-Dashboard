"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import type { ProductSkuAnalyticsResponse } from "@/types/database";

async function fetchProductSkuAnalytics(
  productId: string,
  from: string,
  to: string,
  company: string,
  account: string
): Promise<ProductSkuAnalyticsResponse> {
  const params = new URLSearchParams({ from, to, company, account });
  const response = await fetch(`/api/analytics/products/${productId}/skus?${params.toString()}`);
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
  const company = searchParams.get("company") ?? "";
  const account = searchParams.get("account") ?? "";

  return useQuery({
    queryKey: ["product-sku-analytics", productId, from, to, company, account],
    queryFn: () => fetchProductSkuAnalytics(productId!, from, to, company, account),
    enabled: Boolean(productId && account && enabled),
  });
}
