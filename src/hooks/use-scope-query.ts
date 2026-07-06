"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { copyScopeQueryParams } from "@/lib/filter-params";

/** Serialized global scope query string (company, account, brand, from, to). */
export function useScopeQueryString(): string {
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();

  return useMemo(() => {
    const params = new URLSearchParams();
    copyScopeQueryParams(params, searchParams);
    return params.toString();
  }, [rawQuery, searchParams]);
}
