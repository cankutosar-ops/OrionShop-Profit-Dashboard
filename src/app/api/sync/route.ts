import { NextResponse } from "next/server";
import { beginSyncTrace, endSyncTrace, syncLog } from "@/lib/wildberries/sync-log";
import { executeDashboardSync } from "@/services/dashboard-sync-service";
import {
  ensureDefaultTenant,
  resolveMarketplaceAccountId,
} from "@/services/marketplace-account-service";

export const maxDuration = 300;

/**
 * POST /api/sync
 * Sync Wildberries data into Supabase for a specific marketplace account.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  beginSyncTrace(requestId);

  try {
    syncLog("route", "POST /api/sync received", { requestId });

    const body = await request.json();
    const { marketplaceAccountId, dateFrom, dateTo, entities } = body as {
      marketplaceAccountId?: string;
      dateFrom?: string;
      dateTo?: string;
      entities?: Parameters<typeof executeDashboardSync>[0]["entities"];
    };

    syncLog("route", "Request body parsed", { marketplaceAccountId, dateFrom, dateTo, entities });

    if (!dateFrom || !dateTo) {
      syncLog("route", "Missing dateFrom/dateTo — returning 400");
      return NextResponse.json(
        { error: "dateFrom and dateTo are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const resolved = marketplaceAccountId
      ? { marketplaceAccountId }
      : await resolveMarketplaceAccountId(null, null);

    const result = await executeDashboardSync({
      marketplaceAccountId: resolved.marketplaceAccountId,
      dateFrom,
      dateTo,
      entities,
    });

    syncLog("route", "Returning response", {
      success: result.success,
      status: result.lastSyncStatus,
    });
    endSyncTrace(requestId, result.success);

    return NextResponse.json({
      success: result.success,
      marketplaceAccountId: result.marketplaceAccountId,
      lastSyncStatus: result.lastSyncStatus,
      results: result.results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    const status = message.includes("API key") || message.includes("not found") ? 400 : 500;

    syncLog("route", "POST /api/sync failed", { message, status });
    endSyncTrace(requestId, false);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  await ensureDefaultTenant();

  return NextResponse.json({
    status: "ready",
    message:
      "POST /api/sync with marketplaceAccountId, dateFrom and dateTo to sync Wildberries data.",
    entities: ["products", "orders", "sales", "finance", "stock"],
  });
}
