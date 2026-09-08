import {
  normalizeBrandId,
  scopeSearchParamsFromUrl,
  type ScopeSearchParams,
} from "@/lib/filter-params";
import { requirePageScope } from "@/lib/security/page-scope";
import { parseDateRange } from "@/lib/utils";
import type { ScopedDateRange } from "@/types/database";

export type { ScopeSearchParams };

/**
 * Server-page scope resolution.
 *
 * `account` / `company` arrive from the URL and are untrusted: `requirePageScope`
 * validates them against the session's tenant membership (same rule table as the
 * API `authorize`) before any warehouse query is scoped. Unauthorized claims
 * redirect to /access-denied and never reach the data layer.
 */
export async function resolveScopedDateRange(
  params: ScopeSearchParams
): Promise<ScopedDateRange> {
  const scope = await requirePageScope({
    account: params.account,
    company: params.company,
  });

  return {
    ...parseDateRange(params.from ?? undefined, params.to ?? undefined),
    marketplaceAccountId: scope.marketplaceAccountId,
    companyId: scope.companyId,
    brandId: normalizeBrandId(params.brand ?? undefined),
  };
}

export async function resolveScopedDateRangeFromUrl(url: URL): Promise<ScopedDateRange> {
  return resolveScopedDateRange(scopeSearchParamsFromUrl(url));
}
