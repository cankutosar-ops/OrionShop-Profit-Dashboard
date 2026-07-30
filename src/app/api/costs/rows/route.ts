import { NextResponse } from "next/server";
import { normalizeBrandId, scopeSearchParamsFromUrl } from "@/lib/filter-params";
import { parseDateRange } from "@/lib/utils";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import { fetchCostManagementRows } from "@/services/cost-service";
import type { ScopedDateRange } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authz = await authorizeRequestScope(request, {
      allowDefaultAccount: true,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const url = new URL(request.url);
    const params = scopeSearchParamsFromUrl(url);
    const scope: ScopedDateRange = {
      ...parseDateRange(params.from || undefined, params.to || undefined),
      marketplaceAccountId: authz.marketplaceAccountId!,
      companyId: authz.companyId!,
      brandId: normalizeBrandId(params.brand || undefined),
    };

    const rows = await fetchCostManagementRows(scope);
    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch cost rows";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
