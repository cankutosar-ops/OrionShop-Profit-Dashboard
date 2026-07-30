import { NextResponse } from "next/server";
import { getDashboardSyncStatus } from "@/services/sync-job-service";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  const marketplaceAccountId = authz.marketplaceAccountId!;
  const status = await getDashboardSyncStatus(marketplaceAccountId);
  return NextResponse.json(status);
}
