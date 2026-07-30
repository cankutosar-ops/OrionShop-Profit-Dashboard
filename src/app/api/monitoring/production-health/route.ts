import { NextResponse } from "next/server";
import { getProductionHealthReport } from "@/services/production-health-service";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";

export const dynamic = "force-dynamic";

/**
 * Sprint 9.4 — Production health snapshot (read-only).
 * Never writes. Never triggers sync or repair.
 */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  const marketplaceAccountId = authz.marketplaceAccountId!;

  try {
    const report = await getProductionHealthReport(marketplaceAccountId);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Production health failed" },
      { status: 500 }
    );
  }
}
