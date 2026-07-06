import {
  normalizeBrandId,
  scopeSearchParamsFromUrl,
  type ScopeSearchParams,
} from "@/lib/filter-params";
import { parseDateRange } from "@/lib/utils";
import { resolveMarketplaceAccountId } from "@/services/marketplace-account-service";
import type { ScopedDateRange } from "@/types/database";

export type { ScopeSearchParams };

export async function resolveScopedDateRange(
  params: ScopeSearchParams
): Promise<ScopedDateRange> {
  const { marketplaceAccountId, companyId } = await resolveMarketplaceAccountId(
    params.account,
    params.company
  );

  return {
    ...parseDateRange(params.from, params.to),
    marketplaceAccountId,
    companyId,
    brandId: normalizeBrandId(params.brand),
  };
}

export async function resolveScopedDateRangeFromUrl(url: URL): Promise<ScopedDateRange> {
  return resolveScopedDateRange(scopeSearchParamsFromUrl(url));
}
