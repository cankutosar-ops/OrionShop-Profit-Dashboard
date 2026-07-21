"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { copyProductContextParams } from "@/lib/product-context";
import { copyScopeQueryParams } from "@/lib/filter-params";

/** Serialized scope + product context for in-app links on product-aware pages. */
export function useProductContextQueryString(): string {
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();

  return useMemo(() => {
    const params = new URLSearchParams();
    copyScopeQueryParams(params, searchParams);
    copyProductContextParams(params, searchParams);
    return params.toString();
  }, [rawQuery, searchParams]);
}
