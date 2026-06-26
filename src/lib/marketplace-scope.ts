import { parseDateRange } from "@/lib/utils";
import { resolveMarketplaceAccountId } from "@/services/marketplace-account-service";
import type { ScopedDateRange } from "@/types/database";

export async function resolveScopedDateRange(params: {
  from?: string | null;
  to?: string | null;
  company?: string | null;
  account?: string | null;
}): Promise<ScopedDateRange> {
  const { marketplaceAccountId, companyId } = await resolveMarketplaceAccountId(
    params.account,
    params.company
  );

  return {
    ...parseDateRange(params.from, params.to),
    marketplaceAccountId,
    companyId,
  };
}
