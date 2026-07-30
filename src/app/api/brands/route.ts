import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import { getBrandsForMarketplaceAccount } from "@/services/brand-service";

export async function GET(request: Request) {
  try {
    const authz = await authorizeRequestScope(request, {
      allowDefaultAccount: true,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const brands = await getBrandsForMarketplaceAccount(authz.marketplaceAccountId!);
    return NextResponse.json({ brands });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load brands";
    return NextResponse.json({ error: message, brands: [] }, { status: 500 });
  }
}
