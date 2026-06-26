import { NextResponse } from "next/server";
import type { WbSyncEntity } from "@/lib/wildberries/api-client";
import { createWbSyncService } from "@/lib/wildberries/sync-service";
import { beginSyncTrace, endSyncTrace, syncLog } from "@/lib/wildberries/sync-log";
import type { SyncStatus } from "@/types/database";
import {
  ensureDefaultTenant,
  markAccountSyncFinished,
  markAccountSyncStarted,
  resolveMarketplaceAccountId,
} from "@/services/marketplace-account-service";

export const maxDuration = 300;

function resolveSyncStatus(hasErrors: boolean, resultsCount: number): SyncStatus {
  if (resultsCount === 0) return "failed";
  if (!hasErrors) return "success";
  return "partial";
}

/**
 * POST /api/sync
 * Sync Wildberries data into Supabase for a specific marketplace account.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  beginSyncTrace(requestId);

  let resolvedAccountId: string | null = null;

  try {
    syncLog("route", "POST /api/sync received", { requestId });

    const body = await request.json();
    const { marketplaceAccountId, dateFrom, dateTo, entities } = body as {
      marketplaceAccountId?: string;
      dateFrom?: string;
      dateTo?: string;
      entities?: WbSyncEntity[];
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
    resolvedAccountId = resolved.marketplaceAccountId;

    const syncEntities = entities ?? ["products", "orders", "sales", "finance", "stock"];
    syncLog("route", "Starting sync for marketplace account", {
      marketplaceAccountId: resolvedAccountId,
      syncEntities,
    });

    await markAccountSyncStarted(resolvedAccountId);

    const syncService = await createWbSyncService(resolvedAccountId);
    const results = await syncService.syncAll({
      marketplaceAccountId: resolvedAccountId,
      dateFrom,
      dateTo,
      entities: syncEntities,
    });

    syncLog("route", "Sync completed", {
      resultCount: results.length,
      entities: results.map((r) => r.entity),
    });

    const hasErrors = results.some((r) => r.errors.length > 0);
    const status = resolveSyncStatus(hasErrors, results.length);
    await markAccountSyncFinished(resolvedAccountId, status);

    syncLog("route", "Returning response", { success: !hasErrors, hasErrors, status });
    endSyncTrace(requestId, !hasErrors);

    return NextResponse.json({
      success: !hasErrors,
      marketplaceAccountId: resolvedAccountId,
      lastSyncStatus: status,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    const status = message.includes("API key") || message.includes("not found") ? 400 : 500;

    if (resolvedAccountId) {
      await markAccountSyncFinished(resolvedAccountId, "failed").catch(() => undefined);
    }

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
