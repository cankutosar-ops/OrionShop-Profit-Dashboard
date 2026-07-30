import { NextResponse } from "next/server";
import { listVerificationReports } from "@/services/sync-verification-report-repository";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";

export const dynamic = "force-dynamic";

/** Sprint 9.5 — list immutable verification history (read-only). */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  const marketplaceAccountId = authz.marketplaceAccountId!;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? "50") || 50));

  try {
    const rows = await listVerificationReports(marketplaceAccountId, limit);
    return NextResponse.json({
      marketplaceAccountId,
      count: rows.length,
      reports: rows.map((r) => ({
        id: r.id,
        verifiedAt: r.verified_at,
        healthScore: r.health_score,
        overallResult: r.overall_result,
        schemaStatus: r.schema_status,
        ordersStatus: r.orders_status,
        salesStatus: r.sales_status,
        financeStatus: r.finance_status,
        inventoryStatus: r.inventory_status,
        syncStatus: r.sync_status,
        syncDurationMs: r.sync_duration_ms,
        failuresCount: r.failures.length,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list verification history" },
      { status: 500 }
    );
  }
}
