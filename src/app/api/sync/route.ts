import { NextResponse } from "next/server";
import { getWbApiToken } from "@/lib/wildberries/api-client";
import { wbSyncService } from "@/lib/wildberries/sync-service";
import type { WbSyncEntity } from "@/lib/wildberries/api-client";
import { beginSyncTrace, endSyncTrace, syncLog } from "@/lib/wildberries/sync-log";

export const maxDuration = 300;

/**
 * POST /api/sync
 * Sync Wildberries data into Supabase for a single seller account.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  beginSyncTrace(requestId);

  try {
    syncLog("route", "POST /api/sync received", { requestId });
    getWbApiToken();
    syncLog("route", "WB_API_TOKEN validated");

    const body = await request.json();
    const { dateFrom, dateTo, entities } = body as {
      dateFrom?: string;
      dateTo?: string;
      entities?: WbSyncEntity[];
    };

    syncLog("route", "Request body parsed", { dateFrom, dateTo, entities });

    if (!dateFrom || !dateTo) {
      syncLog("route", "Missing dateFrom/dateTo — returning 400");
      return NextResponse.json(
        { error: "dateFrom and dateTo are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const syncEntities = entities ?? ["products", "orders", "sales", "finance"];
    syncLog("route", "Starting wbSyncService.syncAll", { syncEntities });

    const results = await wbSyncService.syncAll({
      dateFrom,
      dateTo,
      entities: syncEntities,
    });

    syncLog("route", "wbSyncService.syncAll completed", {
      resultCount: results.length,
      entities: results.map((r) => r.entity),
    });

    const hasErrors = results.some((r) => r.errors.length > 0);

    syncLog("route", "Returning response", { success: !hasErrors, hasErrors });
    endSyncTrace(requestId, !hasErrors);

    return NextResponse.json({
      success: !hasErrors,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    const status = message.includes("WB_API_TOKEN") ? 400 : 500;
    syncLog("route", "POST /api/sync failed", { message, status });
    endSyncTrace(requestId, false);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  const configured = Boolean(process.env.WB_API_TOKEN?.trim());

  return NextResponse.json({
    status: configured ? "ready" : "not_configured",
    message: configured
      ? "POST /api/sync with dateFrom and dateTo to sync Wildberries data."
      : "Set WB_API_TOKEN in .env.local to enable sync.",
    entities: ["products", "orders", "sales", "finance"],
  });
}
