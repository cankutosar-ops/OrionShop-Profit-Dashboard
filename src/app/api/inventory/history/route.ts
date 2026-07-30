import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  listAvailableSnapshotDates,
  loadFullHistoricalInventorySnapshot,
  queryHistoricalInventorySnapshot,
} from "@/services/historical-inventory-service";
import type { HistoricalInventorySortField } from "@/lib/historical-inventory-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventory/history
 * One snapshot at a time — account + snapshotDate required.
 * Use full=1 to load the entire day for client-side filter/search.
 */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  const marketplaceAccountId = authz.marketplaceAccountId!;
  const url = new URL(request.url);
  const snapshotDate = url.searchParams.get("snapshotDate")?.trim();
  const datesOnly = url.searchParams.get("datesOnly") === "1";
  const full = url.searchParams.get("full") === "1";

  try {
    if (datesOnly) {
      const availableDates = await listAvailableSnapshotDates(marketplaceAccountId);
      return NextResponse.json({ marketplaceAccountId, availableDates });
    }

    if (!snapshotDate) {
      return NextResponse.json(
        { error: "snapshotDate is required (or datesOnly=1)" },
        { status: 400 }
      );
    }

    if (full) {
      const result = await loadFullHistoricalInventorySnapshot({
        marketplaceAccountId,
        snapshotDate,
      });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, max-age=30" },
      });
    }

    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "100");
    const warehouse = url.searchParams.get("warehouse");
    const search = url.searchParams.get("q") ?? url.searchParams.get("search");
    const sortBy = (url.searchParams.get("sortBy") ??
      "warehouse_name") as HistoricalInventorySortField;
    const sortDir = url.searchParams.get("sortDir") === "desc" ? "desc" : "asc";

    const result = await queryHistoricalInventorySnapshot({
      marketplaceAccountId,
      snapshotDate,
      warehouse,
      search,
      page,
      pageSize,
      sortBy,
      sortDir,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      { status: 500 }
    );
  }
}
