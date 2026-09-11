import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import { listWarehouseLocations } from "@/services/warehouse-location-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/warehouse-locations
 * Reusable Warehouse Location catalog (WB + FBS peers). Type is metadata only.
 */
export async function GET(request: Request) {
  try {
    const authz = await authorizeRequestScope(request, {
      allowDefaultAccount: true,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("activeOnly") !== "0";

    const locations = await listWarehouseLocations(authz.marketplaceAccountId!, {
      activeOnly,
    });

    return NextResponse.json(
      { locations },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load warehouse locations";
    return NextResponse.json({ error: message, locations: [] }, { status: 500 });
  }
}
