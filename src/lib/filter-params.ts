/** Global filter URL keys shared across pages and APIs. */
export const FILTER_PARAMS = {
  company: "company",
  account: "account",
  brand: "brand",
  from: "from",
  to: "to",
} as const;

export type ScopeSearchParams = {
  from?: string | null;
  to?: string | null;
  company?: string | null;
  account?: string | null;
  brand?: string | null;
};

export const SCOPE_QUERY_KEYS = [
  FILTER_PARAMS.from,
  FILTER_PARAMS.to,
  FILTER_PARAMS.company,
  FILTER_PARAMS.account,
  FILTER_PARAMS.brand,
] as const;

export function normalizeBrandId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function copyScopeQueryParams(
  target: URLSearchParams,
  source: Pick<URLSearchParams, "get">
): void {
  for (const key of SCOPE_QUERY_KEYS) {
    const value = source.get(key);
    if (value) target.set(key, value);
  }
}

export function scopeSearchParamsFromUrl(url: URL): ScopeSearchParams {
  return {
    from: url.searchParams.get(FILTER_PARAMS.from),
    to: url.searchParams.get(FILTER_PARAMS.to),
    company: url.searchParams.get(FILTER_PARAMS.company),
    account: url.searchParams.get(FILTER_PARAMS.account),
    brand: url.searchParams.get(FILTER_PARAMS.brand),
  };
}

/** Page `searchParams` accepted by `resolveScopedDateRange`. */
export type PageScopeSearchParamsInput = {
  from?: string;
  to?: string;
  company?: string;
  account?: string;
  brand?: string;
};

export type DashboardPageSearchParamsInput = PageScopeSearchParamsInput & {
  dateManual?: string;
  syncAdjusted?: string;
  accountSwitched?: string;
};

export function scopeParamsToSearchParams(params: PageScopeSearchParamsInput): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of SCOPE_QUERY_KEYS) {
    const value = params[key as keyof PageScopeSearchParamsInput];
    if (value) query.set(key, value);
  }
  return query;
}
