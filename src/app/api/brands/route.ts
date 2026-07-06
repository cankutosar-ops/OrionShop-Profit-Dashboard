import { NextResponse } from "next/server";
import { scopeSearchParamsFromUrl } from "@/lib/filter-params";
import { resolveMarketplaceAccountId } from "@/services/marketplace-account-service";
import { getBrandsForMarketplaceAccount } from "@/services/brand-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scopeParams = scopeSearchParamsFromUrl(url);
    const { marketplaceAccountId } = await resolveMarketplaceAccountId(
      scopeParams.account,
      scopeParams.company
    );

    const brands = await getBrandsForMarketplaceAccount(marketplaceAccountId);
    return NextResponse.json({ brands });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load brands";
    return NextResponse.json({ error: message, brands: [] }, { status: 500 });
  }
}
