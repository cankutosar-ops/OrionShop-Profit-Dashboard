import { NextResponse } from "next/server";
import { getShipmentHistoryForProduct } from "@/services/shipment-history-service";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";

export const maxDuration = 300;

/**
 * GET /api/inventory/shipment-history
 * Inbound WB warehouse shipments for one Inventory product (live Supplies API).
 */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  const marketplaceAccountId = authz.marketplaceAccountId!;
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId")?.trim();

  if (!productId) {
    return NextResponse.json(
      { error: "productId is required" },
      { status: 400 }
    );
  }

  try {
    const result = await getShipmentHistoryForProduct({
      marketplaceAccountId,
      productId,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Supabase is not configured" },
        { status: 503 }
      );
    }

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load shipment history";
    const status = /401|403|token|authorization/i.test(message) ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
