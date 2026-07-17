import { NextResponse } from "next/server";
import { syncLog } from "@/lib/wildberries/sync-log";
import {
  ensureDefaultTenant,
  resolveMarketplaceAccountId,
} from "@/services/marketplace-account-service";
import {
  runBlockingDashboardSync,
  scheduleBackgroundDashboardSync,
  SyncAlreadyRunningError,
} from "@/services/sync-job-service";

export const maxDuration = 300;

/**
 * POST /api/sync
 * Sync Wildberries data into Supabase for a specific marketplace account.
 * Default: returns 202 immediately and runs sync in the background via after().
 * Pass { blocking: true } for CLI/scripts that need a synchronous response.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      marketplaceAccountId,
      dateFrom,
      dateTo,
      entities,
      blocking = false,
    } = body as {
      marketplaceAccountId?: string;
      dateFrom?: string;
      dateTo?: string;
      entities?: Parameters<typeof runBlockingDashboardSync>[0]["entities"];
      blocking?: boolean;
    };

    syncLog("route", "POST /api/sync received", {
      marketplaceAccountId,
      dateFrom,
      dateTo,
      entities,
      blocking,
    });

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

    const syncRequest = {
      marketplaceAccountId: resolved.marketplaceAccountId,
      dateFrom,
      dateTo,
      entities,
    };

    if (blocking) {
      const result = await runBlockingDashboardSync(syncRequest);
      syncLog("route", "Blocking sync complete", {
        success: result.success,
        status: result.lastSyncStatus,
      });
      return NextResponse.json({
        success: result.success,
        marketplaceAccountId: result.marketplaceAccountId,
        lastSyncStatus: result.lastSyncStatus,
        results: result.results,
        timing: result.timing,
        mode: "blocking",
      });
    }

    const scheduled = await scheduleBackgroundDashboardSync(syncRequest);
    syncLog("route", "Background sync accepted", scheduled);

    return NextResponse.json(
      {
        accepted: true,
        mode: "background",
        requestId: scheduled.requestId,
        marketplaceAccountId: scheduled.marketplaceAccountId,
        lastSyncStatus: "running",
        statusUrl: `/api/sync/status?marketplaceAccountId=${scheduled.marketplaceAccountId}`,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Sync failed";
    const status = message.includes("API key") || message.includes("not found") ? 400 : 500;

    syncLog("route", "POST /api/sync failed", { message, status });
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
    defaultMode: "background",
    statusEndpoint: "/api/sync/status?marketplaceAccountId=<id>",
  });
}
