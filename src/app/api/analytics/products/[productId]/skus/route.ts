import { NextResponse } from "next/server";
import { normalizeBrandId, scopeSearchParamsFromUrl } from "@/lib/filter-params";
import { parseDateRange } from "@/lib/utils";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  getCohortMaxOrders,
  getProductSkuAnalytics,
} from "@/services/product-sku-analytics-service";
import type { ScopedDateRange } from "@/types/database";

type RouteParams = { params: Promise<{ productId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const authz = await authorizeRequestScope(request, {
    allowDefaultAccount: true,
    requireMarketplaceAccount: true,
  });
  if (isAuthzFailure(authz)) return authz;

  const { productId } = await params;
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to query params are required" }, { status: 400 });
  }

  try {
    const scopeParams = scopeSearchParamsFromUrl(url);
    const scope: ScopedDateRange = {
      ...parseDateRange(from, to),
      marketplaceAccountId: authz.marketplaceAccountId!,
      companyId: authz.companyId!,
      brandId: normalizeBrandId(scopeParams.brand || undefined),
    };
    const cohortMaxOrders = await getCohortMaxOrders(scope);
    const report = await getProductSkuAnalytics(productId, scope, cohortMaxOrders);

    if (!report) {
      return NextResponse.json({ error: "Product not found or Supabase not configured" }, { status: 404 });
    }

    return NextResponse.json(report, {
      headers: {
        "X-Load-Time-Ms": String(report.loadTimeMs),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load SKU analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
