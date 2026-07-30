import { cache } from "react";
import {
  normalizeBrandId,
  scopeSearchParamsFromUrl,
  type ScopeSearchParams,
} from "@/lib/filter-params";
import { parseDateRange } from "@/lib/utils";
import { resolveMarketplaceAccountId } from "@/services/marketplace-account-service";
import type { ScopedDateRange } from "@/types/database";

export type { ScopeSearchParams };

/** Per-request dedupe of scope resolve (same account/company/dates/brand). */
const resolveScopedDateRangeCached = cache(
  async (
    account: string,
    company: string,
    from: string,
    to: string,
    brand: string
  ): Promise<ScopedDateRange> => {
    const { marketplaceAccountId, companyId } = await resolveMarketplaceAccountId(
      account || null,
      company || null
    );

    return {
      ...parseDateRange(from || undefined, to || undefined),
      marketplaceAccountId,
      companyId,
      brandId: normalizeBrandId(brand || undefined),
    };
  }
);

export async function resolveScopedDateRange(
  params: ScopeSearchParams
): Promise<ScopedDateRange> {
  return resolveScopedDateRangeCached(
    params.account ?? "",
    params.company ?? "",
    params.from ?? "",
    params.to ?? "",
    params.brand ?? ""
  );
}

export async function resolveScopedDateRangeFromUrl(url: URL): Promise<ScopedDateRange> {
  return resolveScopedDateRange(scopeSearchParamsFromUrl(url));
}
